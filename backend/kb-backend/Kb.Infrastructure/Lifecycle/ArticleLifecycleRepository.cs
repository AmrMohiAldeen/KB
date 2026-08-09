using System.Data;
using System.Data.Common;
using System.Linq.Expressions;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Lifecycle;
using Kb.Application.Workflow;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Lifecycle;

public sealed class ArticleLifecycleRepository(KbDbContext dbContext) : IArticleLifecycleRepository
{
    private static readonly Expression<Func<ArticleVersion, LifecycleVersionSummaryData>> VersionSummaryProjection =
        version => new(
            version.VersionId,
            version.ArticleIdFk,
            version.VersionNumber,
            version.ContentJsonStoragePath,
            version.RenderedHtmlStoragePath,
            version.PlainTextStoragePath,
            version.ContentHash,
            version.ContentSizeBytes,
            version.SourceDraftIdFk,
            version.SourceDraftNumber,
            version.SnapshotReason,
            version.PublishedAt != null,
            new(version.CreatedByFkNavigation.UserId, version.CreatedByFkNavigation.FullName),
            version.CreatedAt,
            version.PublishedByFkNavigation == null
                ? null
                : new(version.PublishedByFkNavigation.UserId, version.PublishedByFkNavigation.FullName),
            version.PublishedAt);

    public Task<LifecycleDraftData?> GetCurrentAsync(Guid articleId, CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking()
            .Where(article => article.ArticleId == articleId && article.CurrentDraftIdFk != null)
            .Select(article => new LifecycleDraftData(
                article.CurrentDraftIdFkNavigation!.DraftId,
                article.ArticleId,
                article.AuthorIdFk,
                article.CurrentDraftIdFkNavigation.DraftNumber,
                article.Status,
                article.CurrentDraftIdFkNavigation.Status,
                article.CurrentDraftIdFkNavigation.ContentJsonStoragePath,
                article.CurrentDraftIdFkNavigation.RenderedHtmlStoragePath,
                article.CurrentDraftIdFkNavigation.PlainTextStoragePath,
                article.CurrentDraftIdFkNavigation.ContentHash,
                article.CurrentDraftIdFkNavigation.ContentSizeBytes,
                article.CurrentDraftIdFkNavigation.RowVersion,
                article.CurrentDraftIdFkNavigation.IsLocked,
                article.CurrentDraftIdFkNavigation.LockedByFk,
                article.CurrentDraftIdFkNavigation.CreatedByFk,
                article.CurrentDraftIdFkNavigation.UpdatedAt,
                article.DeletedAt != null || article.Status == ArticleStatuses.Deleted))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<LifecycleVersionData?> GetVersionAsync(
        Guid articleId,
        Guid versionId,
        CancellationToken cancellationToken) =>
        dbContext.ArticleVersions.AsNoTracking()
            .Where(version => version.ArticleIdFk == articleId && version.VersionId == versionId &&
                              version.ArticleIdFkNavigation.DeletedAt == null &&
                              version.ArticleIdFkNavigation.Status != ArticleStatuses.Deleted &&
                              version.ArticleIdFkNavigation.Status != ArticleStatuses.Archived)
            .Select(version => new LifecycleVersionData(
                version.VersionId,
                version.ArticleIdFk,
                version.VersionNumber,
                version.ContentJsonStoragePath,
                version.RenderedHtmlStoragePath,
                version.PlainTextStoragePath,
                version.ContentHash,
                version.ContentSizeBytes,
                version.SourceDraftIdFk,
                version.SourceDraftNumber,
                version.SnapshotReason))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<PagedLifecycleVersionData> GetVersionsAsync(
        Guid articleId,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var source = ActiveVersions(articleId);
        var totalCount = await source.LongCountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);
        var items = await source
            .OrderByDescending(version => version.VersionNumber)
            .ThenByDescending(version => version.VersionId)
            .Skip(skip)
            .Take(pageSize)
            .Select(VersionSummaryProjection)
            .ToListAsync(cancellationToken);
        return new(items, page, pageSize, totalCount);
    }

    public Task<LifecycleVersionSummaryData?> GetVersionSummaryAsync(
        Guid articleId,
        Guid versionId,
        CancellationToken cancellationToken) =>
        ActiveVersions(articleId)
            .Where(version => version.VersionId == versionId)
            .Select(VersionSummaryProjection)
            .SingleOrDefaultAsync(cancellationToken);

    public Task<LifecycleVersionSummaryData?> GetPublishedVersionAsync(
        Guid articleId,
        CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking()
            .Where(article => article.ArticleId == articleId &&
                              article.DeletedAt == null &&
                              article.Status != ArticleStatuses.Deleted &&
                              article.Status != ArticleStatuses.Archived &&
                              article.LastPublishedVersionIdFk != null)
            .Select(article => article.LastPublishedVersionIdFkNavigation!)
            .Select(VersionSummaryProjection)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<LifecycleReviewEventData>> GetReviewHistoryAsync(
        Guid articleId,
        CancellationToken cancellationToken) =>
        await dbContext.ArticleReviewEvents.AsNoTracking()
            .Where(review => review.ArticleIdFk == articleId &&
                             review.ArticleIdFkNavigation.DeletedAt == null &&
                             review.ArticleIdFkNavigation.Status != ArticleStatuses.Deleted &&
                             review.ArticleIdFkNavigation.Status != ArticleStatuses.Archived)
            .OrderByDescending(review => review.CreatedAt)
            .ThenByDescending(review => review.ReviewEventId)
            .Select(review => new LifecycleReviewEventData(
                review.ReviewEventId,
                review.ArticleIdFk,
                review.DraftIdFk,
                review.FromStatus,
                review.ToStatus,
                review.Action,
                new(review.ActorIdFkNavigation.UserId, review.ActorIdFkNavigation.FullName),
                review.Comment,
                review.CreatedAt))
            .ToListAsync(cancellationToken);

    public Task<LifecycleResultData> TransitionAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        string expectedStatus,
        string newStatus,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        VersionSnapshotContentData? snapshot,
        LifecycleAuditData? snapshotAudit,
        bool isOverride,
        CancellationToken cancellationToken) =>
        ExecuteAsync(async token =>
        {
            var (article, draft) = await LoadForMutationAsync(
                articleId, draftId, expectedRowVersion, token);
            EnsureUnlocked(draft);
            if (draft.Status != expectedStatus || article.Status != expectedStatus)
                throw new ConflictException(
                    $"The article cannot transition from {draft.Status} to {newStatus}.");
            if (!isOverride && !ArticleWorkflow.CanTransition(draft.Status, newStatus))
                throw new ConflictException(
                    $"The article cannot transition from {draft.Status} to {newStatus}.");

            article.Status = newStatus;
            article.UpdatedAt = audit.CreatedAt;
            draft.Status = newStatus;
            draft.UpdatedByFk = audit.ActorId;
            draft.UpdatedAt = audit.CreatedAt;
            AdvanceSqliteRowVersion(draft);
            AddReview(articleId, draftId, review);
            AddAudit(articleId, draftId, audit);
            if (snapshot is not null && snapshotAudit is not null)
            {
                var version = await AddSnapshot(article, draft, snapshot, snapshotAudit, null, null, token);
                AddVersionAudit(version, snapshotAudit);
            }
            await SaveChangesAsync(token);
            return await ReadResultAsync(articleId, null, null, audit.CreatedAt, token);
        }, cancellationToken);

    public Task<LifecycleResultData> PublishAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        VersionSnapshotContentData content,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        LifecycleAuditData snapshotAudit,
        CancellationToken cancellationToken) =>
        ExecuteAsync(async token =>
        {
            var (article, draft) = await LoadForMutationAsync(
                articleId, draftId, expectedRowVersion, token);
            EnsureUnlocked(draft);
            if (draft.Status != ArticleStatuses.Approved || article.Status != ArticleStatuses.Approved ||
                !ArticleWorkflow.CanTransition(draft.Status, ArticleStatuses.Published))
                throw new ConflictException(
                    $"The article cannot transition from {draft.Status} to {ArticleStatuses.Published}.");

            var version = await AddSnapshot(article, draft, content, snapshotAudit,
                audit.ActorId, audit.CreatedAt, token);
            var nextNumber = version.VersionNumber;

            article.Status = ArticleStatuses.Published;
            article.LastPublishedVersionIdFk = content.VersionId;
            article.UpdatedAt = audit.CreatedAt;
            draft.Status = ArticleStatuses.Published;
            draft.UpdatedByFk = audit.ActorId;
            draft.UpdatedAt = audit.CreatedAt;
            AdvanceSqliteRowVersion(draft);
            dbContext.SearchIndexJobs.Add(new SearchIndexJob
            {
                SearchJobId = NewId(),
                ArticleIdFk = articleId,
                VersionIdFk = content.VersionId,
                JobType = SearchIndexJobTypes.Upsert,
                Status = JobStatuses.Pending,
                RetryCount = 0,
                CreatedAt = audit.CreatedAt
            });
            AddReview(articleId, draftId, review);
            AddAudit(articleId, draftId, audit);
            AddVersionAudit(version, snapshotAudit);
            await SaveChangesAsync(token);
            return await ReadResultAsync(articleId, content.VersionId, nextNumber, audit.CreatedAt, token);
        }, cancellationToken);

    public Task<LifecycleResultData> RestoreAsync(
        Guid articleId,
        Guid currentDraftId,
        byte[] expectedRowVersion,
        Guid sourceVersionId,
        RestoredDraftContentData content,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        CancellationToken cancellationToken) =>
        ExecuteAsync(async token =>
        {
            var (article, currentDraft) = await LoadForMutationAsync(
                articleId, currentDraftId, expectedRowVersion, token);
            EnsureUnlocked(currentDraft);
            if (currentDraft.Status != article.Status ||
                currentDraft.Status is not (
                    ArticleStatuses.Published or
                    ArticleStatuses.Draft or
                    ArticleStatuses.ChangesRequested))
                throw new ConflictException(
                    "A version can only replace a published, draft, or changes-requested current draft.");
            if (!await dbContext.ArticleVersions.AnyAsync(version =>
                    version.ArticleIdFk == articleId && version.VersionId == sourceVersionId, token))
                throw new NotFoundException("The article version was not found.");
            var nextDraftNumber = (await dbContext.ArticleDrafts
                .Where(draft => draft.ArticleIdFk == articleId)
                .MaxAsync(draft => (int?)draft.DraftNumber, token) ?? 0) + 1;

            // Touch the old current draft under its concurrency token before switching the pointer.
            currentDraft.UpdatedByFk = audit.ActorId;
            currentDraft.UpdatedAt = audit.CreatedAt;
            AdvanceSqliteRowVersion(currentDraft);
            if (dbContext.Database.IsSqlServer())
            {
                dbContext.ArticleDrafts.Add(new ArticleDraft
                {
                    DraftId = content.DraftId,
                    ArticleIdFk = articleId,
                    DraftNumber = nextDraftNumber,
                    ContentJsonStoragePath = content.ContentJsonPath,
                    RenderedHtmlStoragePath = content.RenderedHtmlPath,
                    PlainTextStoragePath = content.PlainTextPath,
                    ContentHash = content.ContentHash,
                    ContentSizeBytes = content.ContentSizeBytes,
                    IsLocked = false,
                    CreatedByFk = audit.ActorId,
                    UpdatedByFk = audit.ActorId,
                    CreatedAt = audit.CreatedAt,
                    UpdatedAt = audit.CreatedAt,
                    Status = ArticleStatuses.Draft
                });
            }
            else
            {
                var restoredRowVersion = Guid.NewGuid().ToByteArray();
                await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO ARTICLE_DRAFTS
                        (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, RenderedHtmlStoragePath,
                         PlainTextStoragePath, ContentHash, ContentSizeBytes, RowVersion, IsLocked,
                         CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
                    VALUES ({content.DraftId}, {articleId}, {nextDraftNumber}, {content.ContentJsonPath},
                            {content.RenderedHtmlPath}, {content.PlainTextPath}, {content.ContentHash},
                            {content.ContentSizeBytes}, {restoredRowVersion}, {false}, {audit.ActorId},
                            {audit.ActorId}, {audit.CreatedAt}, {audit.CreatedAt}, {ArticleStatuses.Draft})
                    """, token);
            }
            article.CurrentDraftIdFk = content.DraftId;
            article.Status = ArticleStatuses.Draft;
            article.UpdatedAt = audit.CreatedAt;
            AddReview(articleId, content.DraftId, review);
            AddAudit(articleId, content.DraftId, audit);
            await SaveChangesAsync(token);
            return await ReadResultAsync(articleId, null, null, audit.CreatedAt, token);
        }, cancellationToken);

    public Task ArchiveAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        CancellationToken cancellationToken) =>
        ExecuteAsync(async token =>
        {
            var (article, draft) = await LoadForMutationAsync(
                articleId, draftId, expectedRowVersion, token);
            EnsureUnlocked(draft);
            article.Status = ArticleStatuses.Archived;
            article.UpdatedAt = audit.CreatedAt;
            draft.UpdatedByFk = audit.ActorId;
            draft.UpdatedAt = audit.CreatedAt;
            AdvanceSqliteRowVersion(draft);
            dbContext.SearchIndexJobs.Add(new SearchIndexJob
            {
                SearchJobId = NewId(),
                ArticleIdFk = articleId,
                VersionIdFk = null,
                JobType = SearchIndexJobTypes.Delete,
                Status = JobStatuses.Pending,
                RetryCount = 0,
                CreatedAt = audit.CreatedAt
            });
            AddReview(articleId, draftId, review);
            AddAudit(articleId, draftId, audit);
            await SaveChangesAsync(token);
            return true;
        }, cancellationToken);

    public Task<LifecycleResultData> UnarchiveAsync(
        Guid articleId,
        Guid draftId,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        CancellationToken cancellationToken) =>
        ExecuteAsync(async token =>
        {
            var article = await dbContext.Articles
                .SingleOrDefaultAsync(item => item.ArticleId == articleId, token)
                ?? throw new NotFoundException("The article was not found.");
            if (article.DeletedAt is not null || article.Status == ArticleStatuses.Deleted)
                throw new NotFoundException("The article was not found.");
            if (article.Status != ArticleStatuses.Archived || article.CurrentDraftIdFk != draftId)
                throw new ConflictException("Only an archived article can be unarchived.");
            var draft = await dbContext.ArticleDrafts
                .SingleOrDefaultAsync(item => item.DraftId == draftId && item.ArticleIdFk == articleId, token)
                ?? throw new NotFoundException("The article draft was not found.");
            EnsureUnlocked(draft);

            article.Status = draft.Status;
            article.UpdatedAt = audit.CreatedAt;
            draft.UpdatedByFk = audit.ActorId;
            draft.UpdatedAt = audit.CreatedAt;
            AdvanceSqliteRowVersion(draft);
            if (article.LastPublishedVersionIdFk is { } versionId)
            {
                dbContext.SearchIndexJobs.Add(new SearchIndexJob
                {
                    SearchJobId = NewId(),
                    ArticleIdFk = articleId,
                    VersionIdFk = versionId,
                    JobType = SearchIndexJobTypes.Upsert,
                    Status = JobStatuses.Pending,
                    RetryCount = 0,
                    CreatedAt = audit.CreatedAt
                });
            }
            AddReview(articleId, draftId, review);
            AddAudit(articleId, draftId, audit);
            await SaveChangesAsync(token);
            return await ReadResultAsync(articleId, null, null, audit.CreatedAt, token);
        }, cancellationToken);

    private async Task<(Article Article, ArticleDraft Draft)> LoadForMutationAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        CancellationToken cancellationToken)
    {
        var article = await dbContext.Articles
            .SingleOrDefaultAsync(item => item.ArticleId == articleId, cancellationToken)
            ?? throw new NotFoundException("The article was not found.");
        if (article.DeletedAt is not null || article.Status is ArticleStatuses.Deleted or ArticleStatuses.Archived)
            throw new NotFoundException("The article was not found.");
        if (article.CurrentDraftIdFk != draftId)
            throw new ConcurrencyConflictException("The article's current draft changed.");

        var draft = await dbContext.ArticleDrafts
            .SingleOrDefaultAsync(item => item.DraftId == draftId && item.ArticleIdFk == articleId,
                cancellationToken)
            ?? throw new NotFoundException("The article draft was not found.");
        if (!draft.RowVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ConcurrencyConflictException();
        if (dbContext.Database.IsSqlServer())
            dbContext.Entry(draft).Property(item => item.RowVersion).OriginalValue = expectedRowVersion;
        return (article, draft);
    }

    private async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
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
        catch (DbUpdateConcurrencyException)
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw new ConcurrencyConflictException();
        }
        catch (DbUpdateException exception) when (IsVersionNumberConflict(exception))
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw new ConcurrencyConflictException(
                "An article version snapshot was created by another request.");
        }
        catch (DbException exception) when (
            exception.Message.Contains("locked", StringComparison.OrdinalIgnoreCase) ||
            exception.Message.Contains("busy", StringComparison.OrdinalIgnoreCase))
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw new ConcurrencyConflictException("The article is being changed by another request.");
        }
        catch
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    private async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConcurrencyConflictException();
        }
    }

    private async Task<LifecycleResultData> ReadResultAsync(
        Guid articleId,
        Guid? versionId,
        int? versionNumber,
        DateTime changedAt,
        CancellationToken cancellationToken)
    {
        dbContext.ChangeTracker.Clear();
        var current = await GetCurrentAsync(articleId, cancellationToken)
            ?? throw new ConcurrencyConflictException("The changed article could not be read back.");
        return new(articleId, current.DraftId, current.DraftStatus, current.RowVersion,
            versionId, versionNumber, changedAt);
    }

    private async Task<ArticleVersion> AddSnapshot(
        Article article,
        ArticleDraft draft,
        VersionSnapshotContentData content,
        LifecycleAuditData snapshotAudit,
        Guid? publishedBy,
        DateTime? publishedAt,
        CancellationToken cancellationToken)
    {
        var nextNumber = (await dbContext.ArticleVersions
            .Where(version => version.ArticleIdFk == article.ArticleId)
            .MaxAsync(version => (int?)version.VersionNumber, cancellationToken) ?? 0) + 1;
        var version = new ArticleVersion
        {
            VersionId = content.VersionId,
            ArticleIdFk = article.ArticleId,
            VersionNumber = nextNumber,
            SourceDraftIdFk = draft.DraftId,
            SourceDraftNumber = draft.DraftNumber,
            SnapshotReason = content.SnapshotReason,
            ContentJsonStoragePath = content.ContentJsonPath,
            RenderedHtmlStoragePath = content.RenderedHtmlPath,
            PlainTextStoragePath = content.PlainTextPath,
            ContentHash = content.ContentHash,
            ContentSizeBytes = content.ContentSizeBytes,
            CreatedAt = snapshotAudit.CreatedAt,
            CreatedByFk = draft.CreatedByFk,
            PublishedByFk = publishedBy,
            PublishedAt = publishedAt
        };
        dbContext.ArticleVersions.Add(version);
        return version;
    }

    private void AddReview(Guid articleId, Guid draftId, LifecycleReviewData review) =>
        dbContext.ArticleReviewEvents.Add(new ArticleReviewEvent
        {
            ReviewEventId = NewId(),
            ArticleIdFk = articleId,
            DraftIdFk = draftId,
            FromStatus = review.FromStatus,
            ToStatus = review.ToStatus,
            Action = review.Action,
            ActorIdFk = review.ActorId,
            Comment = review.Comment,
            CreatedAt = review.CreatedAt
        });

    private void AddAudit(Guid articleId, Guid draftId, LifecycleAuditData audit) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = NewId(),
            ArticleIdFk = articleId,
            ActorIdFk = audit.ActorId,
            ActionType = audit.Action,
            EntityType = ArticleAuditEntityTypes.Draft,
            EntityId = draftId,
            MetaDataJson = audit.MetadataJson,
            CreatedAt = audit.CreatedAt
        });

    private void AddVersionAudit(ArticleVersion version, LifecycleAuditData audit) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = NewId(),
            ArticleIdFk = version.ArticleIdFk,
            ActorIdFk = audit.ActorId,
            ActionType = audit.Action,
            EntityType = ArticleAuditEntityTypes.Version,
            EntityId = version.VersionId,
            MetaDataJson = JsonSerializer.Serialize(new
            {
                articleId = version.ArticleIdFk,
                versionId = version.VersionId,
                versionNumber = version.VersionNumber,
                sourceDraftId = version.SourceDraftIdFk,
                sourceDraftNumber = version.SourceDraftNumber,
                snapshotReason = version.SnapshotReason,
                version.ContentHash
            }),
            CreatedAt = audit.CreatedAt
        });

    private void AdvanceSqliteRowVersion(ArticleDraft draft)
    {
        if (!dbContext.Database.IsSqlServer())
            draft.RowVersion = Guid.NewGuid().ToByteArray();
    }

    private Guid NewId() => dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid();

    private IQueryable<ArticleVersion> ActiveVersions(Guid articleId) =>
        dbContext.ArticleVersions.AsNoTracking()
            .Where(version => version.ArticleIdFk == articleId &&
                              version.ArticleIdFkNavigation.DeletedAt == null &&
                              version.ArticleIdFkNavigation.Status != ArticleStatuses.Deleted &&
                              version.ArticleIdFkNavigation.Status != ArticleStatuses.Archived);

    private static void EnsureUnlocked(ArticleDraft draft)
    {
        if (draft.IsLocked)
            throw new ConflictException("The draft must be unlocked before changing workflow state.");
    }

    private static bool IsVersionNumberConflict(DbUpdateException exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current.Message.Contains("UX_ARTICLE_VERSIONS_Article_VersionNumber",
                    StringComparison.OrdinalIgnoreCase) ||
                (current.Message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase) &&
                 current.Message.Contains("ARTICLE_VERSIONS.ArticleID_FK", StringComparison.OrdinalIgnoreCase)))
                return true;
        return false;
    }

    private static async Task RollbackAsync(
        Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction)
    {
        try
        {
            await transaction.RollbackAsync(CancellationToken.None);
        }
        catch
        {
            // Preserve the original lifecycle exception.
        }
    }
}
