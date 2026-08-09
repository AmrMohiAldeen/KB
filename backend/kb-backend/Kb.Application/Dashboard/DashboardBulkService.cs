using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Articles;
using Kb.Application.Categories;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Dashboard;

public sealed class DashboardBulkService(
    IDashboardRepository repository,
    CategoryService categories,
    ArticleService articles,
    ArticleDraftService drafts,
    ICurrentUser currentUser,
    IPermissionChecker permissionChecker,
    TimeProvider timeProvider)
{
    private const int MaxItems = 100;
    private const int MaxArticleTitleLength = 300;
    private const int MaxCategoryNameLength = 200;

    public async Task<DashboardBulkActionData> MoveAsync(
        IReadOnlyCollection<Guid> articleIds,
        IReadOnlyCollection<Guid> categoryIds,
        Guid destinationCategoryId,
        CancellationToken cancellationToken)
    {
        ValidateSelection(articleIds, categoryIds);
        EnsureId(destinationCategoryId, "Destination category");
        var destination = await categories.GetAsync(destinationCategoryId, cancellationToken)
            ?? throw new NotFoundException("The destination category was not found.");
        if (destination.Status != CategoryStatuses.Active)
            throw new ConflictException("Items cannot be moved into an archived category.");

        if (articleIds.Count > 0)
            await RequirePermissionAsync(PermissionCodes.ArticlesEditAnyDraft, cancellationToken);
        if (categoryIds.Count > 0)
            await RequirePermissionAsync(PermissionCodes.CategoriesManage, cancellationToken);

        var movedCategories = Array.Empty<Guid>();
        if (categoryIds.Count > 0)
        {
            var tree = await categories.GetTreeAsync(cancellationToken);
            var roots = NormalizeSelectedRoots(tree, categoryIds);
            if (roots.Any(root => destination.Path is not null && root.Path is not null &&
                                  destination.Path.StartsWith(root.Path, StringComparison.OrdinalIgnoreCase)))
                throw new ConflictException("A category cannot be moved under itself or one of its descendants.");

            var nextSortOrder = destination.ArticleCount;
            var destinationNode = Flatten(tree).FirstOrDefault(node => node.Id == destinationCategoryId);
            if (destinationNode is not null)
                nextSortOrder = destinationNode.Children.Select(child => child.SortOrder).DefaultIfEmpty(-1).Max() + 1;

            foreach (var root in roots.OrderBy(value => value.SortOrder).ThenBy(value => value.Name))
                await categories.MoveAsync(root.Id,
                    new MoveCategoryCommand(destinationCategoryId, nextSortOrder++), cancellationToken);
            movedCategories = roots.Select(value => value.Id).ToArray();
        }

        if (articleIds.Count > 0)
        {
            var audit = new DashboardReorderAudit(
                currentUser.UserId,
                ArticleAuditActions.Moved,
                JsonSerializer.Serialize(new { destinationCategoryId }),
                timeProvider.GetUtcNow().UtcDateTime);
            await repository.MoveArticlesAsync(articleIds, destinationCategoryId, audit, cancellationToken);
        }

        return new(articleIds.ToArray(), movedCategories);
    }

    public async Task<DashboardBulkActionData> DuplicateAsync(
        IReadOnlyCollection<Guid> articleIds,
        IReadOnlyCollection<Guid> categoryIds,
        CancellationToken cancellationToken)
    {
        ValidateSelection(articleIds, categoryIds);
        if (articleIds.Count > 0)
        {
            await RequirePermissionAsync(PermissionCodes.ArticlesCreate, cancellationToken);
            await RequireAnyPermissionAsync(
                [PermissionCodes.ArticlesEditOwnDraft, PermissionCodes.ArticlesEditAnyDraft], cancellationToken);
        }
        if (categoryIds.Count > 0)
            await RequirePermissionAsync(PermissionCodes.CategoriesManage, cancellationToken);

        var createdCategoryIds = new List<Guid>();
        if (categoryIds.Count > 0)
        {
            var roots = NormalizeSelectedRoots(await categories.GetTreeAsync(cancellationToken), categoryIds);
            foreach (var root in roots.OrderBy(value => value.SortOrder).ThenBy(value => value.Name))
                await DuplicateCategoryBranchAsync(root, root.ParentCategoryId, true, createdCategoryIds,
                    cancellationToken);
        }

        var createdArticleIds = new List<Guid>();
        foreach (var articleId in articleIds)
        {
            var source = await articles.GetAsync(articleId, cancellationToken);
            if (source.Status is ArticleStatuses.Deleted or ArticleStatuses.Archived)
                throw new ConflictException("Archived or deleted articles cannot be duplicated.");
            var categoryId = source.Category?.Id
                ?? throw new ConflictException("The selected article must belong to a category.");
            var sourceDraft = await drafts.GetAsync(articleId, cancellationToken);
            var created = await articles.CreateAsync(new CreateArticleCommand(
                CopyName(source.Title, MaxArticleTitleLength), categoryId, null), cancellationToken);
            var rowVersion = created.CurrentDraft?.RowVersion
                ?? throw new ConflictException("The duplicate article draft could not be initialized.");
            var locked = await drafts.AcquireLockAsync(created.Id, rowVersion, cancellationToken);
            var saved = await drafts.SaveContentAsync(created.Id,
                new SaveDraftContentCommand(sourceDraft.Content, null, null, locked.Draft.RowVersion),
                cancellationToken);
            await drafts.ReleaseLockAsync(created.Id, saved.RowVersion, cancellationToken);
            createdArticleIds.Add(created.Id);
        }

        return new(createdArticleIds, createdCategoryIds);
    }

    private async Task DuplicateCategoryBranchAsync(
        CategoryTreeNode source,
        Guid? parentId,
        bool root,
        ICollection<Guid> createdIds,
        CancellationToken cancellationToken)
    {
        var created = await categories.CreateAsync(new CreateCategoryCommand(
            parentId,
            root ? CopyName(source.Name, MaxCategoryNameLength) : source.Name,
            source.Description,
            source.SortOrder + (root ? 1 : 0),
            null), cancellationToken);
        createdIds.Add(created.Id);
        foreach (var child in source.Children.OrderBy(value => value.SortOrder).ThenBy(value => value.Name))
            await DuplicateCategoryBranchAsync(child, created.Id, false, createdIds, cancellationToken);
    }

    private static IReadOnlyList<CategoryTreeNode> NormalizeSelectedRoots(
        IReadOnlyList<CategoryTreeNode> tree,
        IReadOnlyCollection<Guid> selectedIds)
    {
        var nodes = Flatten(tree).ToDictionary(node => node.Id);
        if (selectedIds.Any(id => !nodes.ContainsKey(id)))
            throw new NotFoundException("One or more selected categories were not found in the valid hierarchy.");
        var selected = selectedIds.ToHashSet();
        return selected.Select(id => nodes[id]).Where(node =>
        {
            var parentId = node.ParentCategoryId;
            var visited = new HashSet<Guid>();
            while (parentId is { } id && visited.Add(id) && nodes.TryGetValue(id, out var parent))
            {
                if (selected.Contains(id)) return false;
                parentId = parent.ParentCategoryId;
            }
            return true;
        }).ToArray();
    }

    private static IEnumerable<CategoryTreeNode> Flatten(IEnumerable<CategoryTreeNode> nodes)
    {
        foreach (var node in nodes)
        {
            yield return node;
            foreach (var child in Flatten(node.Children)) yield return child;
        }
    }

    private async Task RequirePermissionAsync(string permission, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (!await permissionChecker.HasPermissionAsync(currentUser.UserId, permission, cancellationToken))
            throw new ForbiddenException();
    }

    private async Task RequireAnyPermissionAsync(
        IReadOnlyCollection<string> permissions,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        foreach (var permission in permissions)
            if (await permissionChecker.HasPermissionAsync(currentUser.UserId, permission, cancellationToken))
                return;
        throw new ForbiddenException();
    }

    private static void ValidateSelection(
        IReadOnlyCollection<Guid> articleIds,
        IReadOnlyCollection<Guid> categoryIds)
    {
        if (articleIds.Count + categoryIds.Count == 0)
            throw new BusinessRuleException("Select at least one article or category.");
        if (articleIds.Count + categoryIds.Count > MaxItems)
            throw new BusinessRuleException($"A bulk action cannot contain more than {MaxItems} items.");
        if (articleIds.Any(id => id == Guid.Empty) || categoryIds.Any(id => id == Guid.Empty))
            throw new BusinessRuleException("Bulk action IDs must not be empty GUIDs.");
        if (articleIds.Count != articleIds.Distinct().Count() ||
            categoryIds.Count != categoryIds.Distinct().Count())
            throw new BusinessRuleException("Bulk action IDs must not contain duplicates.");
    }

    private static string CopyName(string value, int maxLength)
    {
        const string suffix = " copy";
        var stem = value.Trim();
        return stem[..Math.Min(stem.Length, maxLength - suffix.Length)].TrimEnd() + suffix;
    }

    private static void EnsureId(Guid id, string name)
    {
        if (id == Guid.Empty) throw new BusinessRuleException($"{name} ID must not be an empty GUID.");
    }
}
