using System.Data;
using Kb.Application.Articles;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Articles;

public sealed class ArticleRepository(KbDbContext dbContext) : IArticleRepository
{
    public async Task<T> ExecuteSerializableAsync<T>(Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var result = await operation(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    public async Task<PagedArticleData> GetPagedAsync(ArticleListQuery query, CancellationToken cancellationToken)
    {
        var source = dbContext.Articles.AsNoTracking()
            .Where(article => article.DeletedAt == null && article.Status != ArticleStatuses.Deleted);
        if (query.Search is not null)
            source = source.Where(article => article.Title.Contains(query.Search));
        if (query.CategoryId is { } categoryId)
            source = source.Where(article => article.CategoryIdFk == categoryId);
        if (query.Status is not null)
            source = source.Where(article => article.Status == query.Status);
        if (query.OwnerId is { } ownerId)
            source = source.Where(article => article.AuthorIdFk == ownerId);

        var totalCount = await source.LongCountAsync(cancellationToken);
        var ordered = Order(source, query.SortBy, query.Descending);
        var skip = (int)Math.Min((long)(query.Page - 1) * query.PageSize, int.MaxValue);
        var items = await ordered.Skip(skip).Take(query.PageSize)
            .Select(article => new ArticleListData(
                article.ArticleId,
                article.Title,
                article.Slug,
                article.Status,
                article.CategoryIdFkNavigation == null ? null : new CategoryReference(
                    article.CategoryIdFkNavigation.CategoryId, article.CategoryIdFkNavigation.Name,
                    article.CategoryIdFkNavigation.Slug, article.CategoryIdFkNavigation.Path),
                new UserReference(article.AuthorIdFkNavigation.UserId, article.AuthorIdFkNavigation.FullName),
                article.CurrentDraftIdFk,
                article.LastPublishedVersionIdFk,
                article.CreatedAt,
                article.UpdatedAt,
                article.LastPublishedVersionIdFkNavigation == null
                    ? null : article.LastPublishedVersionIdFkNavigation.PublishedAt,
                article.CurrentDraftIdFkNavigation != null && article.CurrentDraftIdFkNavigation.IsLocked,
                article.CurrentDraftIdFkNavigation == null || article.CurrentDraftIdFkNavigation.LockedByFkNavigation == null
                    ? null : new UserReference(article.CurrentDraftIdFkNavigation.LockedByFkNavigation.UserId,
                        article.CurrentDraftIdFkNavigation.LockedByFkNavigation.FullName)))
            .ToListAsync(cancellationToken);
        return new(items, query.Page, query.PageSize, totalCount);
    }

    public Task<ArticleData?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        ProjectDetails(ActiveArticles().Where(article => article.ArticleId == id))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<ArticleData?> GetBySlugAsync(string slug, CancellationToken cancellationToken) =>
        ProjectDetails(ActiveArticles().Where(article => article.Slug == slug))
            .SingleOrDefaultAsync(cancellationToken);

    private static IQueryable<ArticleData> ProjectDetails(IQueryable<Article> articles) =>
        articles.Select(article => new ArticleData(
            article.ArticleId,
            article.Title,
            article.Slug,
            article.Status,
            article.CategoryIdFkNavigation == null ? null : new CategoryReference(
                article.CategoryIdFkNavigation.CategoryId, article.CategoryIdFkNavigation.Name,
                article.CategoryIdFkNavigation.Slug, article.CategoryIdFkNavigation.Path),
            new UserReference(article.AuthorIdFkNavigation.UserId, article.AuthorIdFkNavigation.FullName),
            article.CurrentDraftIdFkNavigation == null ? null : new DraftData(
                article.CurrentDraftIdFkNavigation.DraftId,
                article.CurrentDraftIdFkNavigation.ContentJsonStoragePath,
                article.CurrentDraftIdFkNavigation.RenderedHtmlStoragePath,
                article.CurrentDraftIdFkNavigation.PlainTextStoragePath,
                article.CurrentDraftIdFkNavigation.ContentHash,
                article.CurrentDraftIdFkNavigation.ContentSizeBytes,
                article.CurrentDraftIdFkNavigation.RowVersion,
                article.CurrentDraftIdFkNavigation.Status,
                article.CurrentDraftIdFkNavigation.IsLocked,
                article.CurrentDraftIdFkNavigation.LockedByFkNavigation == null ? null : new UserReference(
                    article.CurrentDraftIdFkNavigation.LockedByFkNavigation.UserId,
                    article.CurrentDraftIdFkNavigation.LockedByFkNavigation.FullName),
                article.CurrentDraftIdFkNavigation.LockedAt,
                new UserReference(article.CurrentDraftIdFkNavigation.CreatedByFkNavigation.UserId,
                    article.CurrentDraftIdFkNavigation.CreatedByFkNavigation.FullName),
                article.CurrentDraftIdFkNavigation.UpdatedByFkNavigation == null ? null : new UserReference(
                    article.CurrentDraftIdFkNavigation.UpdatedByFkNavigation.UserId,
                    article.CurrentDraftIdFkNavigation.UpdatedByFkNavigation.FullName),
                article.CurrentDraftIdFkNavigation.CreatedAt,
                article.CurrentDraftIdFkNavigation.UpdatedAt),
            article.LastPublishedVersionIdFkNavigation == null ? null : new PublishedVersionData(
                article.LastPublishedVersionIdFkNavigation.VersionId,
                article.LastPublishedVersionIdFkNavigation.VersionNumber,
                article.LastPublishedVersionIdFkNavigation.ContentJsonStoragePath,
                article.LastPublishedVersionIdFkNavigation.RenderedHtmlStoragePath,
                article.LastPublishedVersionIdFkNavigation.PlainTextStoragePath,
                article.LastPublishedVersionIdFkNavigation.ContentHash,
                article.LastPublishedVersionIdFkNavigation.ContentSizeBytes,
                new UserReference(article.LastPublishedVersionIdFkNavigation.CreatedByFkNavigation.UserId,
                    article.LastPublishedVersionIdFkNavigation.CreatedByFkNavigation.FullName),
                article.LastPublishedVersionIdFkNavigation.CreatedAt,
                article.LastPublishedVersionIdFkNavigation.PublishedByFkNavigation == null ? null : new UserReference(
                    article.LastPublishedVersionIdFkNavigation.PublishedByFkNavigation.UserId,
                    article.LastPublishedVersionIdFkNavigation.PublishedByFkNavigation.FullName),
                article.LastPublishedVersionIdFkNavigation.PublishedAt),
            article.CreatedAt,
            article.UpdatedAt,
            article.ArticleReviewEvents.Where(review =>
                    review.ToStatus == ArticleStatuses.SubmittedForReview ||
                    review.ToStatus == ArticleStatuses.Resubmitted)
                .Select(review => (DateTime?)review.CreatedAt).Min(),
            article.ArticleReviewEvents.Where(review => review.ToStatus == ArticleStatuses.Approved)
                .Select(review => (DateTime?)review.CreatedAt).Max(),
            article.LastPublishedVersionIdFkNavigation == null
                ? null : article.LastPublishedVersionIdFkNavigation.PublishedAt));

    public Task<ArticleMutationData?> GetForMutationAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking().Where(article => article.ArticleId == id)
            .Select(article => new ArticleMutationData(article.ArticleId, article.AuthorIdFk, article.Title,
                article.Slug, article.CurrentDraftIdFk,
                article.CurrentDraftIdFkNavigation == null ? null : article.CurrentDraftIdFkNavigation.RowVersion,
                article.CurrentDraftIdFkNavigation == null
                    ? article.Status
                    : article.CurrentDraftIdFkNavigation.Status,
                article.DeletedAt != null || article.Status == ArticleStatuses.Deleted))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<bool> CategoryExistsAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().AnyAsync(category => category.CategoryId == id, cancellationToken);

    public Task<bool> ActiveUserExistsAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Users.AsNoTracking().AnyAsync(user => user.UserId == id && user.IsActive, cancellationToken);

    public Task<bool> SlugExistsAsync(string slug, Guid? excludingArticleId, CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking().AnyAsync(article => article.Slug == slug &&
            article.DeletedAt == null && article.Status != ArticleStatuses.Deleted &&
            (!excludingArticleId.HasValue || article.ArticleId != excludingArticleId.Value), cancellationToken);

    public async Task<ArticleData> InsertWithInitialDraftAndAuditAsync(NewArticleData article,
        ArticleAuditData audit, CancellationToken cancellationToken)
    {
        var entity = new Article
        {
            ArticleId = NewId(), Title = article.Title, Slug = article.Slug, CategoryIdFk = article.CategoryId,
            AuthorIdFk = article.OwnerId, Status = ArticleStatuses.Draft, CreatedAt = article.CreatedAt,
            UpdatedAt = article.CreatedAt
        };
        dbContext.Articles.Add(entity);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            var draftId = NewId();
            if (dbContext.Database.IsSqlServer())
            {
                dbContext.ArticleDrafts.Add(new ArticleDraft
                {
                    DraftId = draftId, ArticleIdFk = entity.ArticleId, DraftNumber = 1,
                    ContentJsonStoragePath = string.Empty,
                    ContentSizeBytes = 0, IsLocked = false, CreatedByFk = article.OwnerId,
                    CreatedAt = article.CreatedAt, UpdatedAt = article.CreatedAt, Status = ArticleStatuses.Draft
                });
                await dbContext.SaveChangesAsync(cancellationToken);
                draftId = dbContext.ArticleDrafts.Local.Single(draft => draft.ArticleIdFk == entity.ArticleId).DraftId;
            }
            else
            {
                var rowVersion = Guid.NewGuid().ToByteArray();
                await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO ARTICLE_DRAFTS
                        (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, ContentSizeBytes, RowVersion, IsLocked,
                         CreatedBy_FK, CreatedAt, UpdatedAt, Status)
                    VALUES ({draftId}, {entity.ArticleId}, {1}, {string.Empty}, {0L}, {rowVersion}, {false},
                            {article.OwnerId}, {article.CreatedAt}, {article.CreatedAt}, {ArticleStatuses.Draft})
                    """, cancellationToken);
            }

            entity.CurrentDraftIdFk = draftId;
            AddAudit(entity.ArticleId, audit);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsSlugUniquenessViolation(exception))
        {
            throw new ConflictException("The article slug was allocated concurrently. Retry the request.");
        }
        return await GetByIdAsync(entity.ArticleId, cancellationToken)
            ?? throw new ConflictException("The created article could not be read back.");
    }

    public async Task<ArticleData> UpdateMetadataAndAuditAsync(Guid id, string title, string slug, Guid categoryId,
        byte[] rowVersion, ArticleAuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Articles.SingleAsync(article => article.ArticleId == id &&
            article.DeletedAt == null && article.Status != ArticleStatuses.Deleted, cancellationToken);
        if (entity.CurrentDraftIdFk is not { } draftId)
            throw new ConcurrencyConflictException("The article does not have a current draft concurrency token.");

        entity.Title = title;
        entity.Slug = slug;
        entity.CategoryIdFk = categoryId;
        entity.UpdatedAt = audit.CreatedAt;
        AddAudit(id, audit);

        try
        {
            if (dbContext.Database.IsSqlServer())
            {
                var draft = await dbContext.ArticleDrafts.SingleAsync(item => item.DraftId == draftId, cancellationToken);
                dbContext.Entry(draft).Property(item => item.RowVersion).OriginalValue = rowVersion;
                draft.UpdatedByFk = audit.ActorId;
                draft.UpdatedAt = audit.CreatedAt;
            }
            else
            {
                var nextRowVersion = Guid.NewGuid().ToByteArray();
                var changed = await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
                    UPDATE ARTICLE_DRAFTS SET RowVersion = {nextRowVersion}, UpdatedBy_FK = {audit.ActorId},
                        UpdatedAt = {audit.CreatedAt}
                    WHERE DraftID = {draftId} AND RowVersion = {rowVersion}
                    """, cancellationToken);
                if (changed != 1) throw new ConcurrencyConflictException();
            }
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConcurrencyConflictException();
        }
        catch (DbUpdateException exception) when (IsSlugUniquenessViolation(exception))
        {
            throw new ConflictException("An active article already uses this slug.");
        }
        dbContext.ChangeTracker.Clear();
        return await GetByIdAsync(id, cancellationToken)
            ?? throw new ConflictException("The updated article could not be read back.");
    }

    public async Task SoftDeleteAndAuditAsync(Guid id, ArticleAuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Articles.SingleAsync(article => article.ArticleId == id, cancellationToken);
        if (entity.DeletedAt is not null || entity.Status == ArticleStatuses.Deleted) return;
        entity.Status = ArticleStatuses.Deleted;
        entity.DeletedAt = audit.CreatedAt;
        entity.UpdatedAt = audit.CreatedAt;
        AddAudit(id, audit);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private IQueryable<Article> ActiveArticles() => dbContext.Articles.AsNoTracking()
        .Where(article => article.DeletedAt == null && article.Status != ArticleStatuses.Deleted);

    private static IOrderedQueryable<Article> Order(IQueryable<Article> query, ArticleSortField field, bool descending) =>
        (field, descending) switch
        {
            (ArticleSortField.CreatedAt, true) => query.OrderByDescending(article => article.CreatedAt).ThenBy(article => article.ArticleId),
            (ArticleSortField.CreatedAt, false) => query.OrderBy(article => article.CreatedAt).ThenBy(article => article.ArticleId),
            (ArticleSortField.Title, true) => query.OrderByDescending(article => article.Title).ThenBy(article => article.ArticleId),
            (ArticleSortField.Title, false) => query.OrderBy(article => article.Title).ThenBy(article => article.ArticleId),
            (_, true) => query.OrderByDescending(article => article.UpdatedAt).ThenBy(article => article.ArticleId),
            _ => query.OrderBy(article => article.UpdatedAt).ThenBy(article => article.ArticleId)
        };

    private void AddAudit(Guid articleId, ArticleAuditData audit) => dbContext.ArticleAuditLogs.Add(new()
    {
        AuditLogId = NewId(), ArticleIdFk = articleId, ActorIdFk = audit.ActorId, ActionType = audit.Action,
        EntityType = ArticleAuditEntityTypes.Article, EntityId = articleId, MetaDataJson = audit.MetadataJson,
        CreatedAt = audit.CreatedAt
    });

    private Guid NewId() => dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid();

    private static bool IsSlugUniquenessViolation(DbUpdateException exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current.Message.Contains("UX_ARTICLES_Slug_Active", StringComparison.OrdinalIgnoreCase) ||
                (current.Message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase) &&
                 current.Message.Contains("ARTICLES.Slug", StringComparison.OrdinalIgnoreCase)))
                return true;
        return false;
    }
}
