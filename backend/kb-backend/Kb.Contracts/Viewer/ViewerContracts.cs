using System.Text.Json;

namespace Kb.Contracts.Viewer;

public sealed record ViewerHandoffExchangeRequest(string Token);
public sealed record ViewerSolutionResponse(Guid SolutionId, string Slug);
public sealed record ViewerSessionResponse(Guid SessionId, Guid CustomerId, string ExternalUserId,
    string ExternalUserEmail, DateTime ExpiresAt, IReadOnlyList<ViewerSolutionResponse> Solutions);
public sealed record ViewerPortalResponse(Guid SolutionId, string Slug, string Name, string? Description);
public sealed record ViewerCategoryNodeResponse(Guid CategoryId, Guid? ParentCategoryId, string Name, string Slug,
    string? Description, int SortOrder, string? Path, int Depth, int ArticleCount,
    IReadOnlyList<ViewerCategoryNodeResponse> Children);
public sealed record ViewerArticleSummaryResponse(Guid ArticleId, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt);
public sealed record ViewerArticleResponse(Guid ArticleId, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, JsonElement Content);
