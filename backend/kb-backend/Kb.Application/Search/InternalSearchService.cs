using Kb.Application.Abstractions;
using Kb.Application.Exceptions;

namespace Kb.Application.Search;

public sealed class InternalSearchService(IInternalSearchClient client, ICurrentUser currentUser)
{
    public const int DefaultPageSize = 25;
    public const int MaxPageSize = 100;

    public Task<InternalSearchResult> SearchAsync(
        string? query,
        string? status,
        Guid? categoryId,
        Guid? ownerId,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException();
        if (string.IsNullOrWhiteSpace(query))
            throw new BusinessRuleException("Search query is required.");
        if (query.Trim().Length > 200)
            throw new BusinessRuleException("Search query cannot exceed 200 characters.");
        if (page < 1)
            throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize < 1 || pageSize > MaxPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxPageSize}.");
        if (categoryId == Guid.Empty || ownerId == Guid.Empty)
            throw new BusinessRuleException("Filter IDs must not be empty GUIDs.");

        return client.SearchAsync(new InternalSearchQuery(
            query.Trim(),
            string.IsNullOrWhiteSpace(status) ? null : status.Trim(),
            categoryId,
            ownerId,
            page,
            pageSize), cancellationToken);
    }
}
