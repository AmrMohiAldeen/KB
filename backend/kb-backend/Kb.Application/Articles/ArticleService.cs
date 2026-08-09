using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Articles;

public sealed class ArticleService(
    IArticleRepository repository,
    ISlugGenerator slugGenerator,
    ICurrentUser currentUser,
    IPermissionChecker permissionChecker,
    TimeProvider timeProvider)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    private const int MaxTitleLength = 300;
    private const int MaxSlugLength = 350;
    private static readonly string[] Statuses =
    [
        ArticleStatuses.Draft, ArticleStatuses.SubmittedForReview, ArticleStatuses.InReview,
        ArticleStatuses.ChangesRequested, ArticleStatuses.Approved,
        ArticleStatuses.Published
    ];

    public Task<PagedArticleData> GetPagedAsync(string? search, Guid? categoryId, string? status, Guid? ownerId,
        int page, int pageSize, string? sortBy, string? sortDirection, CancellationToken cancellationToken)
    {
        if (page < 1)
            throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize < 1 || pageSize > MaxPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxPageSize}.");
        if (categoryId == Guid.Empty || ownerId == Guid.Empty)
            throw new BusinessRuleException("Filter IDs must not be empty GUIDs.");

        var normalizedSearch = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var normalizedStatus = NormalizeStatus(status);
        var field = (sortBy ?? "updatedAt").Trim().ToLowerInvariant() switch
        {
            "updatedat" or "updated" => ArticleSortField.UpdatedAt,
            "createdat" or "created" => ArticleSortField.CreatedAt,
            "title" => ArticleSortField.Title,
            "position" => ArticleSortField.Position,
            _ => throw new BusinessRuleException("Sort field must be updatedAt, createdAt, title, or position.")
        };
        var descending = (sortDirection ?? "desc").Trim().ToLowerInvariant() switch
        {
            "desc" => true,
            "asc" => false,
            _ => throw new BusinessRuleException("Sort direction must be asc or desc.")
        };
        return repository.GetPagedAsync(new(normalizedSearch, categoryId, normalizedStatus, ownerId,
            page, pageSize, field, descending), cancellationToken);
    }

    public async Task<ArticleData> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        EnsureId(id, "Article");
        return await repository.GetByIdAsync(id, cancellationToken)
            ?? throw new NotFoundException("The article was not found.");
    }

    public async Task<ArticleData> GetBySlugAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = NormalizeSlug(slug);
        return await repository.GetBySlugAsync(normalized, cancellationToken)
            ?? throw new NotFoundException("The article was not found.");
    }

    public async Task<ArticleData> CreateAsync(CreateArticleCommand command, CancellationToken cancellationToken)
    {
        await RequirePermissionAsync(PermissionCodes.ArticlesCreate, cancellationToken);
        var title = NormalizeTitle(command.Title);
        EnsureId(command.CategoryId, "Category");
        var ownerId = currentUser.UserId;
        EnsureId(ownerId, "Authenticated user");

        return await repository.ExecuteSerializableAsync(async token =>
        {
            if (!await repository.CategoryExistsAsync(command.CategoryId, token))
                throw new NotFoundException("The category was not found.");
            if (!await repository.ActiveUserExistsAsync(ownerId, token))
                throw new NotFoundException("The authenticated internal user was not found or is inactive.");

            var slug = await AllocateSlugAsync(command.Slug ?? title, token);
            var now = timeProvider.GetUtcNow().UtcDateTime;
            var audit = Audit(ownerId, ArticleAuditActions.Created, new
            {
                title, slug, categoryId = command.CategoryId, ownerId
            }, now);
            return await repository.InsertWithInitialDraftAndAuditAsync(
                new(title, slug, command.CategoryId, ownerId, now), audit, token);
        }, cancellationToken);
    }

    public async Task<ArticleData> UpdateAsync(Guid id, UpdateArticleCommand command,
        CancellationToken cancellationToken)
    {
        EnsureId(id, "Article");
        EnsureId(command.CategoryId, "Category");
        if (command.RowVersion.Length == 0)
            throw new BusinessRuleException("Row version is required.");
        var title = NormalizeTitle(command.Title);
        var actorId = currentUser.UserId;

        return await repository.ExecuteSerializableAsync(async token =>
        {
            var existing = await repository.GetForMutationAsync(id, token)
                ?? throw new NotFoundException("The article was not found.");
            if (existing.IsDeleted)
                throw new NotFoundException("The article was not found.");
            if (existing.Status is not ArticleStatuses.Draft and not ArticleStatuses.ChangesRequested)
                throw new ConflictException(
                    $"Article metadata cannot be edited while the draft is in the {existing.Status} state.");
            await RequireEditPermissionAsync(existing.OwnerId, actorId, token);
            if (!await repository.CategoryExistsAsync(command.CategoryId, token))
                throw new NotFoundException("The category was not found.");

            var slug = command.Slug is null ? existing.Slug : NormalizeSlug(command.Slug);
            if (!string.Equals(slug, existing.Slug, StringComparison.OrdinalIgnoreCase) &&
                await repository.SlugExistsAsync(slug, id, token))
                throw new ConflictException("An active article already uses this slug.");

            if (existing.CurrentDraftRowVersion is null ||
                !existing.CurrentDraftRowVersion.AsSpan().SequenceEqual(command.RowVersion))
                throw new ConcurrencyConflictException();

            var now = timeProvider.GetUtcNow().UtcDateTime;
            var audit = Audit(actorId, ArticleAuditActions.Updated, new
            {
                before = new { existing.Title, existing.Slug },
                after = new { title, slug, categoryId = command.CategoryId }
            }, now);
            return await repository.UpdateMetadataAndAuditAsync(id, title, slug, command.CategoryId,
                command.RowVersion, audit, token);
        }, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        EnsureId(id, "Article");
        await RequirePermissionAsync(PermissionCodes.ArticlesDelete, cancellationToken);
        var actorId = currentUser.UserId;
        await repository.ExecuteSerializableAsync(async token =>
        {
            var existing = await repository.GetForMutationAsync(id, token)
                ?? throw new NotFoundException("The article was not found.");
            if (existing.IsDeleted)
                return true;

            var now = timeProvider.GetUtcNow().UtcDateTime;
            await repository.SoftDeleteAndAuditAsync(id,
                Audit(actorId, ArticleAuditActions.Deleted,
                    new { existing.Title, existing.Slug, existing.OwnerId }, now), token);
            return true;
        }, cancellationToken);
    }

    private async Task RequireEditPermissionAsync(Guid ownerId, Guid actorId, CancellationToken cancellationToken)
    {
        if (ownerId == actorId &&
            (await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditOwnDraft, cancellationToken) ||
             await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditAnyDraft, cancellationToken)))
            return;
        if (ownerId != actorId &&
            await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditAnyDraft, cancellationToken))
            return;
        throw new ForbiddenException("You do not have permission to edit this article.");
    }

    private async Task RequirePermissionAsync(string permission, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException();
        if (!await permissionChecker.HasPermissionAsync(currentUser.UserId, permission, cancellationToken))
            throw new ForbiddenException();
    }

    private async Task<string> AllocateSlugAsync(string source, CancellationToken cancellationToken)
    {
        var baseSlug = NormalizeSlug(source);
        for (var number = 1; number < int.MaxValue; number++)
        {
            var suffix = number == 1 ? string.Empty : $"-{number}";
            var stemLength = MaxSlugLength - suffix.Length;
            if (stemLength <= 0) break;
            var candidate = baseSlug[..Math.Min(baseSlug.Length, stemLength)].TrimEnd('-') + suffix;
            if (!await repository.SlugExistsAsync(candidate, null, cancellationToken))
                return candidate;
        }
        throw new ConflictException("A unique article slug could not be allocated.");
    }

    private string NormalizeSlug(string source)
    {
        if (string.IsNullOrWhiteSpace(source))
            throw new BusinessRuleException("Article slug cannot be empty or whitespace.");
        var generated = slugGenerator.Generate(source);
        if (generated.Length == 0)
            throw new BusinessRuleException("Article slug must contain at least one supported letter or number.");
        return generated[..Math.Min(generated.Length, MaxSlugLength)].Trim('-');
    }

    private static string NormalizeTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new BusinessRuleException("Article title is required.");
        var normalized = title.Trim();
        if (normalized.Length > MaxTitleLength)
            throw new BusinessRuleException($"Article title cannot exceed {MaxTitleLength} characters.");
        return normalized;
    }

    private static string? NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return null;
        var match = Statuses.FirstOrDefault(candidate => candidate.Equals(status.Trim(), StringComparison.OrdinalIgnoreCase));
        return match ?? throw new BusinessRuleException("Article status filter is not supported.");
    }

    private static void EnsureId(Guid id, string name)
    {
        if (id == Guid.Empty)
            throw new BusinessRuleException($"{name} ID must not be an empty GUID.");
    }

    private static ArticleAuditData Audit(Guid actorId, string action, object metadata, DateTime createdAt) =>
        new(actorId, action, JsonSerializer.Serialize(metadata), createdAt);
}
