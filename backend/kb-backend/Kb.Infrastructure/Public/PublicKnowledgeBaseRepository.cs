using Kb.Application.Public;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Public;

public sealed class PublicKnowledgeBaseRepository(KbDbContext db) : IPublicKnowledgeBaseRepository
{
    public async Task<IReadOnlyList<PublicCategoryData>> GetCategoriesAsync(CancellationToken cancellationToken) =>
        await VisibleCategories().Select(category => new PublicCategoryData(category.CategoryId,
            category.ParentCategoryIdFk, category.Name, category.Slug, category.Description, category.SortOrder,
            category.Path, category.Depth, category.Articles.Count(article =>
                article.Visibility == ContentVisibilities.Public && article.Status == ArticleStatuses.Published &&
                article.DeletedAt == null && article.LastPublishedVersionIdFk != null)))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<PublicArticleSummaryData>> GetArticlesAsync(string? search, Guid? categoryId,
        CancellationToken cancellationToken)
    {
        var query = VisibleArticles();
        if (search is not null) query = query.Where(article => article.Title.Contains(search));
        if (categoryId is { } id) query = query.Where(article => article.CategoryIdFk == id);
        return await query.OrderBy(article => article.Position).ThenBy(article => article.Title)
            .Select(article => new PublicArticleSummaryData(article.ArticleId, article.Title, article.Slug,
                article.CategoryIdFk!.Value, article.CategoryIdFkNavigation!.Name,
                article.CategoryIdFkNavigation.Path ?? article.CategoryIdFkNavigation.Name, article.UpdatedAt))
            .ToListAsync(cancellationToken);
    }

    public Task<PublicArticleSourceData?> GetArticleBySlugAsync(string slug, CancellationToken cancellationToken) =>
        VisibleArticles().Where(article => article.Slug == slug)
            .Select(article => new PublicArticleSourceData(article.ArticleId, article.Title, article.Slug,
                article.CategoryIdFk!.Value, article.CategoryIdFkNavigation!.Name,
                article.CategoryIdFkNavigation.Path ?? article.CategoryIdFkNavigation.Name, article.UpdatedAt,
                article.LastPublishedVersionIdFkNavigation!.ContentJsonStoragePath))
            .SingleOrDefaultAsync(cancellationToken);

    private IQueryable<Data.Entities.Category> VisibleCategories() => db.Categories.AsNoTracking().Where(category =>
        category.Status == CategoryStatuses.Active && category.Visibility == ContentVisibilities.Public &&
        category.Path != null && !db.Categories.Any(ancestor => ancestor.Path != null &&
            category.Path.StartsWith(ancestor.Path) && ancestor.Visibility == ContentVisibilities.Internal));

    private IQueryable<Data.Entities.Article> VisibleArticles() => db.Articles.AsNoTracking().Where(article =>
        article.Visibility == ContentVisibilities.Public && article.Status == ArticleStatuses.Published &&
        article.DeletedAt == null && article.LastPublishedVersionIdFk != null && article.CategoryIdFk != null &&
        article.CategoryIdFkNavigation != null && article.CategoryIdFkNavigation.Status == CategoryStatuses.Active &&
        article.CategoryIdFkNavigation.Visibility == ContentVisibilities.Public &&
        article.CategoryIdFkNavigation.Path != null && !db.Categories.Any(ancestor => ancestor.Path != null &&
            article.CategoryIdFkNavigation.Path.StartsWith(ancestor.Path) &&
            ancestor.Visibility == ContentVisibilities.Internal));
}
