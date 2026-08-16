using Kb.Application.Articles;

namespace Kb.Application.Dashboard;

public enum DashboardFilter
{
    Everything,
    Published,
    DraftUnpublished,
    ToReview,
    Archived
}

public enum DashboardSort
{
    Position,
    Title,
    UpdatedAt,
    CreatedAt
}

public sealed record DashboardQuery(
    string? Search,
    Guid? CategoryId,
    DashboardFilter Filter,
    DashboardSort Sort,
    int Page,
    int PageSize);

public sealed record DashboardCategoryData(
    Guid Id,
    Guid? ParentId,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    string? Path,
    int Depth,
    int ArticleCount,
    string Status,
    string Visibility);

public sealed record DashboardItemData(
    string Kind,
    Guid Id,
    int Position,
    string Title,
    DateTime? CreatedAt,
    DateTime? UpdatedAt,
    DashboardCategoryData? Category,
    ArticleListData? Article);

public sealed record DashboardFilterCountsData(
    long Everything,
    long Published,
    long DraftUnpublished,
    long ToReview,
    long Archived);

public sealed record DashboardPageData(
    IReadOnlyList<DashboardItemData> Items,
    int Page,
    int PageSize,
    long TotalCount,
    long ArticleCount,
    long EverythingArticleCount,
    DashboardFilterCountsData FilterCounts,
    bool Truncated);

public sealed record DashboardReorderAudit(
    Guid ActorId,
    string Action,
    string MetadataJson,
    DateTime CreatedAt);

public sealed record DashboardBulkActionData(
    IReadOnlyList<Guid> ArticleIds,
    IReadOnlyList<Guid> CategoryIds);
