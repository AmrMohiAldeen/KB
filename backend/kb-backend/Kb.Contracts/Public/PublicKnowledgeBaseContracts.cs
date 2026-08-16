using System.Text.Json;

namespace Kb.Contracts.Public;

public sealed record PublicCategoryNodeResponse(Guid CategoryId, Guid? ParentCategoryId, string Name, string Slug,
    string? Description, int SortOrder, string? Path, int Depth, int ArticleCount,
    IReadOnlyList<PublicCategoryNodeResponse> Children);
public sealed record PublicArticleSummaryResponse(Guid ArticleId, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt);
public sealed record PublicArticleResponse(Guid ArticleId, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, JsonElement Content);
