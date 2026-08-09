using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Dashboard;

public sealed class DashboardService(
    IDashboardRepository repository,
    ICurrentUser currentUser,
    TimeProvider timeProvider)
{
    public const int DefaultPageSize = 100;
    public const int MaxPageSize = 100;

    public async Task<DashboardPageData> GetAsync(
        string? search,
        Guid? categoryId,
        string? filter,
        string? sortBy,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        if (page < 1)
            throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize < 1 || pageSize > MaxPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxPageSize}.");
        if (categoryId == Guid.Empty)
            throw new BusinessRuleException("Category ID must not be an empty GUID.");
        if (categoryId is { } id && !await repository.CategoryExistsAsync(id, cancellationToken))
            throw new NotFoundException("The category was not found.");

        var normalizedFilter = (filter ?? nameof(DashboardFilter.Everything)).Trim().ToLowerInvariant() switch
        {
            "everything" => DashboardFilter.Everything,
            "published" => DashboardFilter.Published,
            "draftunpublished" or "draft-unpublished" => DashboardFilter.DraftUnpublished,
            "toreview" or "to-review" => DashboardFilter.ToReview,
            "archived" => DashboardFilter.Archived,
            _ => throw new BusinessRuleException("Dashboard filter is not supported.")
        };
        var normalizedSort = (sortBy ?? "position").Trim().ToLowerInvariant() switch
        {
            "position" => DashboardSort.Position,
            "title" => DashboardSort.Title,
            "updatedat" or "updated" => DashboardSort.UpdatedAt,
            "createdat" or "created" => DashboardSort.CreatedAt,
            _ => throw new BusinessRuleException("Dashboard sort must be position, title, updatedAt, or createdAt.")
        };

        return await repository.GetAsync(new(
            string.IsNullOrWhiteSpace(search) ? null : search.Trim(),
            categoryId,
            normalizedFilter,
            normalizedSort,
            page,
            pageSize), cancellationToken);
    }

    public Task ReorderCategoryAsync(Guid id, Guid targetId, string? placement,
        CancellationToken cancellationToken) => ReorderAsync(
        id, targetId, placement, "category", CategoryAuditActions.Reordered,
        (placeAfter, audit) => repository.ReorderCategoryAsync(id, targetId, placeAfter, audit, cancellationToken));

    public Task ReorderArticleAsync(Guid id, Guid targetId, string? placement,
        CancellationToken cancellationToken) => ReorderAsync(
        id, targetId, placement, "article", ArticleAuditActions.Reordered,
        (placeAfter, audit) => repository.ReorderArticleAsync(id, targetId, placeAfter, audit, cancellationToken));

    private Task ReorderAsync(
        Guid id,
        Guid targetId,
        string? placement,
        string kind,
        string action,
        Func<bool, DashboardReorderAudit, Task> reorder)
    {
        if (id == Guid.Empty || targetId == Guid.Empty)
            throw new BusinessRuleException($"Dashboard {kind} IDs must not be empty GUIDs.");
        if (id == targetId)
            return Task.CompletedTask;
        var placeAfter = (placement ?? "before").Trim().ToLowerInvariant() switch
        {
            "before" => false,
            "after" => true,
            _ => throw new BusinessRuleException("Dashboard reorder placement must be before or after.")
        };
        var audit = new DashboardReorderAudit(
            currentUser.UserId,
            action,
            JsonSerializer.Serialize(new { targetId, placement = placeAfter ? "after" : "before" }),
            timeProvider.GetUtcNow().UtcDateTime);
        return reorder(placeAfter, audit);
    }
}
