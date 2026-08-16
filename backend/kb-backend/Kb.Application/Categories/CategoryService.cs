using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Microsoft.Extensions.Logging;

namespace Kb.Application.Categories;

public sealed class CategoryService(
    ICategoryRepository repository,
    ISlugGenerator slugGenerator,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    ILogger<CategoryService> logger)
{
    private const int MaxNameLength = 200;
    private const int MaxDescriptionLength = 1000;
    private const int MaxSlugLength = 250;
    private const int MaxPathLength = 2048;

    public Task<CategoryData?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        repository.GetByIdAsync(id, cancellationToken);

    public async Task<IReadOnlyList<CategoryTreeNode>> GetTreeAsync(CancellationToken cancellationToken)
    {
        var categories = await repository.GetAllAsync(cancellationToken);
        var ids = categories.Select(category => category.Id).ToHashSet();
        var children = categories
            .Where(category => category.ParentCategoryId is { } parentId && ids.Contains(parentId))
            .GroupBy(category => category.ParentCategoryId!.Value)
            .ToDictionary(group => group.Key, group => Order(group).ToArray());

        foreach (var orphan in categories.Where(category => category.ParentCategoryId is { } parentId && !ids.Contains(parentId)))
            logger.LogError("Category {CategoryId} references missing parent {ParentCategoryId} and was omitted.", orphan.Id, orphan.ParentCategoryId);

        var emitted = new HashSet<Guid>();
        var roots = new List<CategoryTreeNode>();
        foreach (var root in Order(categories.Where(category => category.ParentCategoryId is null)))
        {
            var node = BuildNode(root, children, emitted, new HashSet<Guid>());
            if (node is not null)
                roots.Add(node);
        }
        foreach (var unvisited in categories.Where(category => !emitted.Contains(category.Id)))
            logger.LogError("Category {CategoryId} is cyclic or disconnected and was omitted.", unvisited.Id);
        return roots;
    }

    public Task<CategoryData> CreateAsync(CreateCategoryCommand command, CancellationToken cancellationToken)
    {
        var (name, description) = ValidateWrite(command.Name, command.Description, command.SortOrder);
        var visibility = NormalizeVisibility(command.Visibility);
        var actorId = currentUser.UserId;
        return repository.ExecuteSerializableAsync(async token =>
        {
            CategoryData? parent = null;
            if (command.ParentCategoryId is { } parentId)
            {
                parent = await repository.GetByIdAsync(parentId, token)
                    ?? throw new NotFoundException("The parent category was not found.");
                EnsureValidStoredPath(parent);
            }

            var slug = await GenerateUniqueSlugAsync(command.Slug ?? name, null, token);
            var depth = parent is null ? 0 : checked(parent.Depth + 1);
            var inserted = await repository.InsertAsync(
                new(command.ParentCategoryId, name, slug, description, command.SortOrder, depth, visibility), token);
            var path = parent is null ? $"/{FormatId(inserted.Id)}/" : $"{parent.Path}{FormatId(inserted.Id)}/";
            EnsurePathFits(path);
            var audit = Audit(actorId, CategoryAuditActions.Created, new
            {
                name, parentId = command.ParentCategoryId, path, depth, sortOrder = command.SortOrder, visibility
            });
            return await repository.SetPathAndAuditAsync(inserted.Id, path, depth, audit, token);
        }, cancellationToken);
    }

    public Task<CategoryData> UpdateAsync(Guid id, UpdateCategoryCommand command, CancellationToken cancellationToken)
    {
        var (name, description) = ValidateWrite(command.Name, command.Description, command.SortOrder);
        var actorId = currentUser.UserId;
        return repository.ExecuteSerializableAsync(async token =>
        {
            var existing = await repository.GetByIdAsync(id, token)
                ?? throw new NotFoundException("The category was not found.");
            var visibility = command.Visibility is null ? existing.Visibility : NormalizeVisibility(command.Visibility);
            var slug = command.Slug is null
                ? existing.Slug
                : await GenerateUniqueSlugAsync(command.Slug, existing.Id, token);
            var audit = Audit(actorId,
                existing.Visibility == visibility ? CategoryAuditActions.Updated : CategoryAuditActions.VisibilityChanged, new
            {
                before = new { existing.Name, existing.Slug, existing.Description, existing.SortOrder, existing.Visibility },
                after = new { name, slug, description, sortOrder = command.SortOrder, visibility },
                visibilityChange = existing.Visibility == visibility ? null : new { oldValue = existing.Visibility, newValue = visibility }
            });
            return await repository.UpdateAndAuditAsync(id, name, slug, description, command.SortOrder, visibility, audit, token);
        }, cancellationToken);
    }

    public Task<CategoryData> SetArchivedAsync(Guid id, bool archived, CancellationToken cancellationToken)
    {
        var actorId = currentUser.UserId;
        return repository.ExecuteSerializableAsync(async token =>
        {
            var category = await repository.GetByIdAsync(id, token)
                ?? throw new NotFoundException("The category was not found.");
            var status = archived ? CategoryStatuses.Archived : CategoryStatuses.Active;
            if (category.Status == status)
                return category;
            var action = archived ? CategoryAuditActions.Archived : CategoryAuditActions.Unarchived;
            var audit = Audit(actorId, action, new { category.Name, oldStatus = category.Status, newStatus = status });
            return await repository.SetStatusAndAuditAsync(id, status, audit, token);
        }, cancellationToken);
    }

    public Task<CategoryData> MoveAsync(Guid id, MoveCategoryCommand command, CancellationToken cancellationToken)
    {
        ValidateSortOrder(command.SortOrder);
        var actorId = currentUser.UserId;
        return repository.ExecuteSerializableAsync(async token =>
        {
            var category = await repository.GetByIdAsync(id, token)
                ?? throw new NotFoundException("The category was not found.");
            EnsureValidStoredPath(category);
            if (command.ParentCategoryId == id)
                throw new ConflictException("A category cannot be moved under itself.");

            CategoryData? parent = null;
            if (command.ParentCategoryId is { } parentId)
            {
                parent = await repository.GetByIdAsync(parentId, token)
                    ?? throw new NotFoundException("The destination parent category was not found.");
                EnsureValidStoredPath(parent);
                if (parent.Path!.StartsWith(category.Path!, StringComparison.OrdinalIgnoreCase))
                    throw new ConflictException("A category cannot be moved under one of its descendants.");
            }

            var descendants = await repository.GetDescendantsAsync(category.Path!, category.Id, token);
            var newDepth = parent is null ? 0 : checked(parent.Depth + 1);
            var newPath = parent is null ? $"/{FormatId(category.Id)}/" : $"{parent.Path}{FormatId(category.Id)}/";
            EnsurePathFits(newPath);
            var depthDelta = newDepth - category.Depth;
            var updates = new List<HierarchyUpdate>(descendants.Count + 1)
            {
                new(category.Id, command.ParentCategoryId, newPath, newDepth, command.SortOrder)
            };
            foreach (var descendant in descendants)
            {
                EnsureValidStoredPath(descendant);
                var descendantPath = newPath + descendant.Path![category.Path!.Length..];
                EnsurePathFits(descendantPath);
                updates.Add(new(descendant.Id, descendant.ParentCategoryId, descendantPath,
                    checked(descendant.Depth + depthDelta), descendant.SortOrder));
            }

            var audit = Audit(actorId, CategoryAuditActions.Moved, new
            {
                category.Name,
                oldParentId = category.ParentCategoryId,
                newParentId = command.ParentCategoryId,
                oldPath = category.Path,
                newPath,
                oldDepth = category.Depth,
                newDepth,
                oldSortOrder = category.SortOrder,
                newSortOrder = command.SortOrder
            });
            return await repository.MoveAndAuditAsync(updates, audit, token);
        }, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var actorId = currentUser.UserId;
        await repository.ExecuteSerializableAsync(async token =>
        {
            var category = await repository.GetByIdAsync(id, token)
                ?? throw new NotFoundException("The category was not found.");
            if (await repository.HasChildrenAsync(id, token))
                throw new ConflictException("A category with child categories cannot be deleted.");
            if (await repository.HasArticlesAsync(id, token))
                throw new ConflictException("A category referenced by articles cannot be deleted.");

            var audit = Audit(actorId, CategoryAuditActions.Deleted, new
            {
                category.Name, category.Slug, parentId = category.ParentCategoryId, category.Path, category.Depth
            });
            await repository.DeleteAndAuditAsync(id, audit, token);
            return true;
        }, cancellationToken);
    }

    private async Task<string> GenerateUniqueSlugAsync(string source, Guid? excludingId, CancellationToken cancellationToken)
    {
        var generated = slugGenerator.Generate(source);
        var baseSlug = string.IsNullOrWhiteSpace(generated) ? "category" : generated;
        baseSlug = baseSlug[..Math.Min(baseSlug.Length, MaxSlugLength)].Trim('-');
        if (baseSlug.Length == 0)
            baseSlug = "category";
        for (var number = 1; number < int.MaxValue; number++)
        {
            var suffix = number == 1 ? string.Empty : $"-{number}";
            var stemLength = MaxSlugLength - suffix.Length;
            if (stemLength <= 0)
                break;
            var candidate = baseSlug[..Math.Min(baseSlug.Length, stemLength)].TrimEnd('-') + suffix;
            if (!await repository.SlugExistsAsync(candidate, excludingId, cancellationToken))
                return candidate;
        }
        throw new ConflictException("A unique category slug could not be allocated.");
    }

    private AuditData Audit(Guid actorId, string action, object metadata) =>
        new(actorId, action, JsonSerializer.Serialize(metadata), timeProvider.GetUtcNow().UtcDateTime);

    private static (string Name, string? Description) ValidateWrite(string name, string? description, int sortOrder)
    {
        ValidateSortOrder(sortOrder);
        if (string.IsNullOrWhiteSpace(name))
            throw new BusinessRuleException("Category name is required.");
        var trimmedName = name.Trim();
        if (trimmedName.Length > MaxNameLength)
            throw new BusinessRuleException($"Category name cannot exceed {MaxNameLength} characters.");
        if (description is not null && string.IsNullOrWhiteSpace(description))
            throw new BusinessRuleException("Category description cannot contain only whitespace.");
        var trimmedDescription = description?.Trim();
        if (trimmedDescription?.Length > MaxDescriptionLength)
            throw new BusinessRuleException($"Category description cannot exceed {MaxDescriptionLength} characters.");
        return (trimmedName, trimmedDescription);
    }

    private static void ValidateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new BusinessRuleException("Category sort order cannot be negative.");
    }

    private static void EnsureValidStoredPath(CategoryData category)
    {
        if (category.Path is null || !category.Path.EndsWith($"/{FormatId(category.Id)}/", StringComparison.OrdinalIgnoreCase))
            throw new ConflictException($"Category {category.Id} has an invalid stored hierarchy path.");
    }

    private static void EnsurePathFits(string path)
    {
        if (path.Length > MaxPathLength)
            throw new ConflictException($"The resulting category path exceeds the {MaxPathLength}-character database limit.");
    }

    private static string FormatId(Guid id) => id.ToString("D").ToLowerInvariant();
    private static IOrderedEnumerable<CategoryData> Order(IEnumerable<CategoryData> categories) =>
        categories.OrderBy(category => category.SortOrder).ThenBy(category => category.Name, StringComparer.OrdinalIgnoreCase);

    private CategoryTreeNode? BuildNode(CategoryData category, IReadOnlyDictionary<Guid, CategoryData[]> children,
        ISet<Guid> emitted, ISet<Guid> active)
    {
        if (!active.Add(category.Id))
        {
            logger.LogError("Cycle detected at category {CategoryId}; branch omitted.", category.Id);
            return null;
        }
        if (!emitted.Add(category.Id))
        {
            active.Remove(category.Id);
            logger.LogError("Category {CategoryId} appeared twice; duplicate branch omitted.", category.Id);
            return null;
        }
        var nodes = new List<CategoryTreeNode>();
        if (children.TryGetValue(category.Id, out var candidates))
            foreach (var child in candidates)
            {
                var node = BuildNode(child, children, emitted, active);
                if (node is not null)
                    nodes.Add(node);
            }
        active.Remove(category.Id);
        return new(category.Id, category.ParentCategoryId, category.Name, category.Slug, category.Description,
            category.SortOrder, category.Path, category.Depth, category.ArticleCount, nodes, category.Status,
            category.Visibility);
    }

    private static string NormalizeVisibility(string visibility)
    {
        var value = visibility?.Trim();
        return ContentVisibilities.All.FirstOrDefault(candidate =>
                   candidate.Equals(value, StringComparison.OrdinalIgnoreCase))
               ?? throw new BusinessRuleException("Visibility must be Public or Internal.");
    }
}
