using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Articles;
using Kb.Contracts.Common;

namespace Kb.Contracts.Dashboard;

public sealed record DashboardReorderRequest(Guid TargetId, string Placement);

public sealed class DashboardBulkMoveRequest : IValidatableObject
{
    public IReadOnlyList<Guid> ArticleIds { get; init; } = [];
    public IReadOnlyList<Guid> CategoryIds { get; init; } = [];
    public Guid DestinationCategoryId { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        DashboardBulkValidation.Validate(ArticleIds, CategoryIds, DestinationCategoryId);
}

public sealed class DashboardBulkDuplicateRequest : IValidatableObject
{
    public IReadOnlyList<Guid> ArticleIds { get; init; } = [];
    public IReadOnlyList<Guid> CategoryIds { get; init; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        DashboardBulkValidation.Validate(ArticleIds, CategoryIds);
}

public sealed record DashboardBulkActionResponse(
    int ArticleCount,
    int CategoryCount,
    IReadOnlyList<Guid> ArticleIds,
    IReadOnlyList<Guid> CategoryIds);

internal static class DashboardBulkValidation
{
    public static IEnumerable<ValidationResult> Validate(
        IReadOnlyList<Guid>? articleIds,
        IReadOnlyList<Guid>? categoryIds,
        Guid? destinationCategoryId = null)
    {
        articleIds ??= [];
        categoryIds ??= [];
        if (articleIds.Count + categoryIds.Count == 0)
            yield return new ValidationResult("Select at least one article or category.");
        if (articleIds.Count + categoryIds.Count > ContractLimits.MaxDashboardBulkItems)
            yield return new ValidationResult(
                $"A bulk action cannot contain more than {ContractLimits.MaxDashboardBulkItems} items.");
        if (articleIds.Any(id => id == Guid.Empty) || categoryIds.Any(id => id == Guid.Empty))
            yield return new ValidationResult("Bulk action IDs must not be empty GUIDs.");
        if (articleIds.Count != articleIds.Distinct().Count() || categoryIds.Count != categoryIds.Distinct().Count())
            yield return new ValidationResult("Bulk action IDs must not contain duplicates.");
        if (destinationCategoryId.HasValue && destinationCategoryId.Value == Guid.Empty)
            yield return new ValidationResult("Destination category ID is required.", ["DestinationCategoryId"]);
    }
}

public sealed record DashboardCategoryResponse(
    Guid Id,
    Guid? ParentId,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    string? Path,
    int Depth,
    int ArticleCount,
    string Status);

public sealed record DashboardItemResponse(
    string Kind,
    Guid Id,
    int Position,
    DashboardCategoryResponse? Category,
    ArticleListItemResponse? Article);

public sealed record DashboardFilterCountsResponse(
    long Everything,
    long Published,
    long DraftUnpublished,
    long ToReview,
    long Archived);

public sealed record DashboardItemsResponse(
    IReadOnlyList<DashboardItemResponse> Items,
    int Page,
    int PageSize,
    long TotalCount,
    long ArticleCount,
    long EverythingArticleCount,
    DashboardFilterCountsResponse FilterCounts,
    bool Truncated);
