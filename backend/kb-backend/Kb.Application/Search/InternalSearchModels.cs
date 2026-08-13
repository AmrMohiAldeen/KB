namespace Kb.Application.Search;

public sealed record InternalSearchQuery(
    string Query,
    string? Status,
    Guid? CategoryId,
    Guid? OwnerId,
    int Page,
    int PageSize);

public sealed record InternalSearchHit(
    string Kind,
    Guid Id,
    string Title,
    string Slug,
    string Status,
    Guid? CategoryId,
    string? CategoryName,
    string? CategoryPath,
    Guid? OwnerId,
    string? OwnerName,
    DateTime UpdatedAt,
    string? TitleHighlight,
    string? PathHighlight,
    string? Snippet);

public sealed record InternalSearchFacet(string Value, long Count);

public sealed record InternalSearchResult(
    IReadOnlyList<InternalSearchHit> Hits,
    long TotalCount,
    int Page,
    int PageSize,
    IReadOnlyList<InternalSearchFacet> Statuses,
    IReadOnlyList<InternalSearchFacet> Categories,
    IReadOnlyList<InternalSearchFacet> Owners);

public interface IInternalSearchClient
{
    Task<InternalSearchResult> SearchAsync(InternalSearchQuery query, CancellationToken cancellationToken);
}

public interface IInternalSearchMaintenance
{
    Task<InternalSearchRebuildResult> RebuildAsync(CancellationToken cancellationToken);
}

public sealed record InternalSearchRebuildResult(string Collection, int ArticleCount, int CategoryCount);
