namespace Kb.Contracts.Search;

public sealed record InternalSearchHitResponse(string Kind, Guid Id, string Title, string Slug, string Status,
    Guid? CategoryId, string? CategoryName, string? CategoryPath, Guid? OwnerId, string? OwnerName,
    DateTime UpdatedAt, string? TitleHighlight, string? PathHighlight, string? Snippet);
public sealed record InternalSearchFacetResponse(string Value, long Count);
public sealed record InternalSearchResponse(IReadOnlyList<InternalSearchHitResponse> Hits, long TotalCount,
    int Page, int PageSize, IReadOnlyList<InternalSearchFacetResponse> Statuses,
    IReadOnlyList<InternalSearchFacetResponse> Categories, IReadOnlyList<InternalSearchFacetResponse> Owners);
public sealed record InternalSearchRebuildResponse(string Collection, int ArticleCount, int CategoryCount);
