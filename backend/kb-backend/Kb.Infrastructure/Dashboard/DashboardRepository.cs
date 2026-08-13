using System.Data;
using Kb.Application.Articles;
using Kb.Application.Dashboard;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Kb.Infrastructure.Search;

namespace Kb.Infrastructure.Dashboard;

public sealed class DashboardRepository(KbDbContext dbContext) : IDashboardRepository
{
    public Task<bool> CategoryExistsAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().AnyAsync(category => category.CategoryId == id, cancellationToken);

    public async Task<DashboardPageData> GetAsync(DashboardQuery query, CancellationToken cancellationToken)
    {
        var categories = dbContext.Categories.AsNoTracking();
        if (query.CategoryId is { } parentId)
            categories = categories.Where(category => category.ParentCategoryIdFk == parentId);
        if (query.Search is not null)
            categories = categories.Where(category => category.Name.Contains(query.Search));

        var everythingArticles = ActiveArticles();
        everythingArticles = ApplyArticleScope(everythingArticles, query.Search, query.CategoryId);

        var archivedArticles = ApplyArticleScope(
            dbContext.Articles.AsNoTracking()
                .Where(article => article.DeletedAt == null && article.Status == ArticleStatuses.Archived),
            query.Search,
            query.CategoryId);
        var articles = query.Filter == DashboardFilter.Archived
            ? archivedArticles
            : everythingArticles;
        articles = ApplyFilter(articles, query.Filter);

        var categoryCount = await categories.LongCountAsync(cancellationToken);
        var articleCount = await articles.LongCountAsync(cancellationToken);
        var everythingArticleCount = await everythingArticles.LongCountAsync(cancellationToken);
        var filterCounts = new DashboardFilterCountsData(
            everythingArticleCount,
            await ApplyFilter(everythingArticles, DashboardFilter.Published).LongCountAsync(cancellationToken),
            await ApplyFilter(everythingArticles, DashboardFilter.DraftUnpublished).LongCountAsync(cancellationToken),
            await ApplyFilter(everythingArticles, DashboardFilter.ToReview).LongCountAsync(cancellationToken),
            await archivedArticles.LongCountAsync(cancellationToken));
        var totalCount = categoryCount + articleCount;
        var windowSize = (int)Math.Min((long)query.Page * query.PageSize, int.MaxValue);

        var categoryItems = await OrderCategories(categories, query.Sort)
            .Take(windowSize)
            .Select(category => new DashboardCategoryData(
                category.CategoryId,
                category.ParentCategoryIdFk,
                category.Name,
                category.Slug,
                category.Description,
                category.SortOrder,
                category.Path,
                category.Depth,
                category.Articles.Count(article =>
                    article.DeletedAt == null && article.Status != ArticleStatuses.Deleted &&
                    article.Status != ArticleStatuses.Archived),
                category.Status))
            .ToListAsync(cancellationToken);

        var articleItems = await OrderArticles(articles, query.Sort)
            .Take(windowSize)
            .Select(article => new ArticleListData(
                article.ArticleId,
                article.Title,
                article.Slug,
                article.Status,
                article.CategoryIdFkNavigation == null ? null : new CategoryReference(
                    article.CategoryIdFkNavigation.CategoryId,
                    article.CategoryIdFkNavigation.Name,
                    article.CategoryIdFkNavigation.Slug,
                    article.CategoryIdFkNavigation.Path),
                new UserReference(article.AuthorIdFkNavigation.UserId, article.AuthorIdFkNavigation.FullName),
                article.CurrentDraftIdFk,
                article.LastPublishedVersionIdFk,
                article.CreatedAt,
                article.UpdatedAt,
                article.LastPublishedVersionIdFkNavigation == null
                    ? null
                    : article.LastPublishedVersionIdFkNavigation.PublishedAt,
                article.CurrentDraftIdFkNavigation != null && article.CurrentDraftIdFkNavigation.IsLocked,
                article.CurrentDraftIdFkNavigation == null ||
                    article.CurrentDraftIdFkNavigation.LockedByFkNavigation == null
                    ? null
                    : new UserReference(
                        article.CurrentDraftIdFkNavigation.LockedByFkNavigation.UserId,
                        article.CurrentDraftIdFkNavigation.LockedByFkNavigation.FullName),
                article.Position))
            .ToListAsync(cancellationToken);

        var combined = categoryItems.Select(category => new DashboardItemData(
                "category", category.Id, category.SortOrder, category.Name, null, null, category, null))
            .Concat(articleItems.Select(article => new DashboardItemData(
                "article", article.Id, article.Position, article.Title, article.CreatedAt, article.UpdatedAt,
                null, article)));
        var ordered = OrderCombined(combined, query.Sort);
        var skip = (int)Math.Min((long)(query.Page - 1) * query.PageSize, int.MaxValue);
        var items = ordered.Skip(skip).Take(query.PageSize).ToArray();

        return new(items, query.Page, query.PageSize, totalCount, articleCount, everythingArticleCount, filterCounts,
            (long)query.Page * query.PageSize < totalCount);
    }

    public async Task ReorderCategoryAsync(Guid id, Guid targetId, bool placeAfter, DashboardReorderAudit audit,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var pair = await dbContext.Categories
                .Where(category => category.CategoryId == id || category.CategoryId == targetId)
                .ToDictionaryAsync(category => category.CategoryId, cancellationToken);
            if (!pair.TryGetValue(id, out var item) || !pair.TryGetValue(targetId, out var target))
                throw new NotFoundException("The category being reordered no longer exists.");
            if (item.ParentCategoryIdFk != target.ParentCategoryIdFk)
                throw new ConflictException("Categories can only be reordered within the same parent category.");

            var siblings = await dbContext.Categories
                .Where(category => category.ParentCategoryIdFk == item.ParentCategoryIdFk)
                .OrderBy(category => category.SortOrder)
                .ThenBy(category => category.Name)
                .ThenBy(category => category.CategoryId)
                .ToListAsync(cancellationToken);
            MoveRelative(siblings, item, target, placeAfter);
            for (var index = 0; index < siblings.Count; index++)
                siblings[index].SortOrder = index;
            AddAudit(id, null, AuditEntityTypes.Category, audit);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task ReorderArticleAsync(Guid id, Guid targetId, bool placeAfter, DashboardReorderAudit audit,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var pair = await dbContext.Articles
                .Where(article => (article.ArticleId == id || article.ArticleId == targetId) &&
                                  article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)
                .ToDictionaryAsync(article => article.ArticleId, cancellationToken);
            if (!pair.TryGetValue(id, out var item) || !pair.TryGetValue(targetId, out var target))
                throw new NotFoundException("The article being reordered no longer exists.");
            if (item.CategoryIdFk != target.CategoryIdFk)
                throw new ConflictException("Articles can only be reordered within the same category.");

            var siblings = await dbContext.Articles
                .Where(article => article.CategoryIdFk == item.CategoryIdFk && article.DeletedAt == null &&
                                  article.Status != ArticleStatuses.Deleted)
                .OrderBy(article => article.Position)
                .ThenBy(article => article.Title)
                .ThenBy(article => article.ArticleId)
                .ToListAsync(cancellationToken);
            MoveRelative(siblings, item, target, placeAfter);
            for (var index = 0; index < siblings.Count; index++)
                siblings[index].Position = index;
            AddAudit(id, id, ArticleAuditEntityTypes.Article, audit);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task MoveArticlesAsync(IReadOnlyCollection<Guid> articleIds, Guid destinationCategoryId,
        DashboardReorderAudit audit, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var destination = await dbContext.Categories.AsNoTracking()
                .SingleOrDefaultAsync(category => category.CategoryId == destinationCategoryId, cancellationToken)
                ?? throw new NotFoundException("The destination category was not found.");
            if (destination.Status != CategoryStatuses.Active)
                throw new ConflictException("Articles cannot be moved into an archived category.");

            var articles = await dbContext.Articles
                .Where(article => articleIds.Contains(article.ArticleId) && article.DeletedAt == null &&
                                  article.Status != ArticleStatuses.Deleted &&
                                  article.Status != ArticleStatuses.Archived)
                .OrderBy(article => article.Position).ThenBy(article => article.ArticleId)
                .ToListAsync(cancellationToken);
            if (articles.Count != articleIds.Count)
                throw new NotFoundException("One or more selected articles were not found or are not active.");

            var nextPosition = (await dbContext.Articles
                .Where(article => article.CategoryIdFk == destinationCategoryId &&
                                  !articleIds.Contains(article.ArticleId) && article.DeletedAt == null &&
                                  article.Status != ArticleStatuses.Deleted &&
                                  article.Status != ArticleStatuses.Archived)
                .Select(article => (int?)article.Position).MaxAsync(cancellationToken) ?? -1) + 1;

            foreach (var article in articles)
            {
                var oldCategoryId = article.CategoryIdFk;
                article.CategoryIdFk = destinationCategoryId;
                article.Position = nextPosition++;
                article.UpdatedAt = audit.CreatedAt;
                AddAudit(article.ArticleId, article.ArticleId, ArticleAuditEntityTypes.Article,
                    audit with
                    {
                        MetadataJson = System.Text.Json.JsonSerializer.Serialize(new
                        {
                            oldCategoryId,
                            newCategoryId = destinationCategoryId
                        })
                    });
            }

            foreach (var article in articles)
                await SearchIndexJobQueue.EnqueueArticleAsync(dbContext, article.ArticleId,
                    SearchIndexJobTypes.Upsert, audit.CreatedAt, cancellationToken);

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    private static void MoveRelative<T>(IList<T> siblings, T item, T target, bool placeAfter)
    {
        siblings.Remove(item);
        var targetIndex = siblings.IndexOf(target);
        siblings.Insert(targetIndex + (placeAfter ? 1 : 0), item);
    }

    private void AddAudit(Guid entityId, Guid? articleId, string entityType, DashboardReorderAudit audit) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
            ArticleIdFk = articleId,
            ActorIdFk = audit.ActorId,
            ActionType = audit.Action,
            EntityType = entityType,
            EntityId = entityId,
            MetaDataJson = audit.MetadataJson,
            CreatedAt = audit.CreatedAt
        });

    private IQueryable<Article> ActiveArticles() => dbContext.Articles.AsNoTracking()
        .Where(article => article.DeletedAt == null && article.Status != ArticleStatuses.Deleted &&
                          article.Status != ArticleStatuses.Archived);

    private static IQueryable<Article> ApplyArticleScope(
        IQueryable<Article> source,
        string? search,
        Guid? categoryId)
    {
        if (search is not null)
            source = source.Where(article => article.Title.Contains(search));
        if (categoryId is { } id)
            source = source.Where(article => article.CategoryIdFk == id);
        return source;
    }

    private static IQueryable<Article> ApplyFilter(IQueryable<Article> source, DashboardFilter filter) =>
        filter switch
        {
            DashboardFilter.Published => source.Where(article => article.Status == ArticleStatuses.Published),
            DashboardFilter.DraftUnpublished => source.Where(article =>
                article.Status != ArticleStatuses.Published && article.Status != ArticleStatuses.Deleted &&
                article.Status != ArticleStatuses.Archived),
            DashboardFilter.ToReview => source.Where(article =>
                article.Status == ArticleStatuses.SubmittedForReview ||
                article.Status == ArticleStatuses.InReview),
            _ => source
        };

    private static IOrderedQueryable<Category> OrderCategories(
        IQueryable<Category> source,
        DashboardSort sort) => sort switch
        {
            DashboardSort.Title => source.OrderBy(category => category.Name).ThenBy(category => category.CategoryId),
            _ => source.OrderBy(category => category.SortOrder)
                .ThenBy(category => category.Name)
                .ThenBy(category => category.CategoryId)
        };

    private static IOrderedQueryable<Article> OrderArticles(
        IQueryable<Article> source,
        DashboardSort sort) => sort switch
        {
            DashboardSort.Title => source.OrderBy(article => article.Title).ThenBy(article => article.ArticleId),
            DashboardSort.UpdatedAt => source.OrderByDescending(article => article.UpdatedAt)
                .ThenBy(article => article.Title)
                .ThenBy(article => article.ArticleId),
            DashboardSort.CreatedAt => source.OrderByDescending(article => article.CreatedAt)
                .ThenBy(article => article.Title)
                .ThenBy(article => article.ArticleId),
            _ => source.OrderBy(article => article.Position)
                .ThenBy(article => article.Title)
                .ThenBy(article => article.ArticleId)
        };

    private static IOrderedEnumerable<DashboardItemData> OrderCombined(
        IEnumerable<DashboardItemData> source,
        DashboardSort sort) => sort switch
        {
            DashboardSort.Title => source.OrderBy(item => item.Kind == "category" ? 0 : 1)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
                .ThenBy(item => item.Id),
            DashboardSort.UpdatedAt => source.OrderBy(item => item.Kind == "category" ? 0 : 1)
                .ThenByDescending(item => item.UpdatedAt ?? DateTime.MinValue)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
                .ThenBy(item => item.Id),
            DashboardSort.CreatedAt => source.OrderBy(item => item.Kind == "category" ? 0 : 1)
                .ThenByDescending(item => item.CreatedAt ?? DateTime.MinValue)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
                .ThenBy(item => item.Id),
            _ => source.OrderBy(item => item.Kind == "category" ? 0 : 1)
                .ThenBy(item => item.Position)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
                .ThenBy(item => item.Id)
        };
}
