using System.Text.Json;

namespace Kb.Application.Public;

public sealed record PublicCategoryData(Guid Id, Guid? ParentId, string Name, string Slug, string? Description,
    int SortOrder, string? Path, int Depth, int ArticleCount);
public sealed record PublicCategoryNode(Guid Id, Guid? ParentId, string Name, string Slug, string? Description,
    int SortOrder, string? Path, int Depth, int ArticleCount, IReadOnlyList<PublicCategoryNode> Children);
public sealed record PublicArticleSummaryData(Guid Id, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt);
public sealed record PublicArticleSourceData(Guid Id, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, string ContentJsonPath);
public sealed record PublicArticleData(Guid Id, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, JsonElement Content);

public interface IPublicKnowledgeBaseRepository
{
    Task<IReadOnlyList<PublicCategoryData>> GetCategoriesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<PublicArticleSummaryData>> GetArticlesAsync(string? search, Guid? categoryId,
        CancellationToken cancellationToken);
    Task<PublicArticleSourceData?> GetArticleBySlugAsync(string slug, CancellationToken cancellationToken);
}
