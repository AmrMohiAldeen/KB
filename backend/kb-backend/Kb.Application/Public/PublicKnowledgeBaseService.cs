using System.Text.Json;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Microsoft.Extensions.Options;

namespace Kb.Application.Public;

public sealed class PublicKnowledgeBaseService(
    IPublicKnowledgeBaseRepository repository,
    IObjectStorage storage,
    IOptions<PublicKnowledgeBaseOptions> options)
{
    public async Task<IReadOnlyList<PublicCategoryNode>> GetTreeAsync(CancellationToken cancellationToken)
    {
        var categories = await repository.GetCategoriesAsync(cancellationToken);
        var visibleIds = categories.Select(item => item.Id).ToHashSet();
        var children = categories.Where(item => item.ParentId is { } id && visibleIds.Contains(id))
            .GroupBy(item => item.ParentId!.Value).ToDictionary(group => group.Key,
                group => group.OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ToArray());
        PublicCategoryNode Map(PublicCategoryData item) => new(item.Id, item.ParentId, item.Name, item.Slug,
            item.Description, item.SortOrder, item.Path, item.Depth, item.ArticleCount,
            children.TryGetValue(item.Id, out var values) ? values.Select(Map).ToArray() : []);
        return categories.Where(item => item.ParentId is null).OrderBy(item => item.SortOrder)
            .ThenBy(item => item.Name).Select(Map).ToArray();
    }

    public Task<IReadOnlyList<PublicArticleSummaryData>> GetArticlesAsync(string? search, Guid? categoryId,
        CancellationToken cancellationToken) => repository.GetArticlesAsync(
            string.IsNullOrWhiteSpace(search) ? null : search.Trim(), categoryId, cancellationToken);

    public async Task<PublicArticleData> GetArticleBySlugAsync(string slug, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(slug)) throw new NotFoundException("The article was not found.");
        var source = await repository.GetArticleBySlugAsync(slug.Trim(), cancellationToken)
            ?? throw new NotFoundException("The article was not found.");
        try
        {
            await using var stream = await storage.DownloadAsync(options.Value.ArticleContentContainerName,
                source.ContentJsonPath, cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            return new(source.Id, source.Title, source.Slug, source.CategoryId, source.CategoryName,
                source.CategoryPath, source.UpdatedAt, document.RootElement.Clone());
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Viewer responses deliberately collapse missing/inconsistent content to the same safe 404.
            throw new NotFoundException("The article was not found.");
        }
    }
}

public sealed class PublicKnowledgeBaseOptions
{
    public string ArticleContentContainerName { get; set; } = "article-content";
}
