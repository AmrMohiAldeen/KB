using Kb.Contracts.Articles;

namespace Kb.Contracts.Dashboard;

public sealed record DashboardCategoryResponse(
    Guid Id,
    Guid? ParentId,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    string? Path,
    int Depth,
    int ArticleCount);

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
