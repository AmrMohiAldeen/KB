using System.Data;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Translations;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Search;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Translations;

public sealed class AutomaticArticleTranslationRepository(KbDbContext db) : IAutomaticArticleTranslationRepository
{
    public async Task<AutomaticTranslationSnapshot> GetSnapshotAsync(Guid sourceArticleId, Guid targetArticleId,
        CancellationToken ct)
    {
        var source = await db.Articles.AsNoTracking()
            .Include(x => x.CurrentDraftIdFkNavigation)
            .Include(x => x.LastPublishedVersionIdFkNavigation)
            .SingleOrDefaultAsync(x => x.ArticleId == sourceArticleId && x.DeletedAt == null &&
                x.Status != ArticleStatuses.Deleted, ct)
            ?? throw new NotFoundException("The source article was not found.");
        var target = await db.Articles.AsNoTracking()
            .Include(x => x.CurrentDraftIdFkNavigation)
            .Include(x => x.ArticleTranslationMetadata)
            .SingleOrDefaultAsync(x => x.ArticleId == targetArticleId && x.DeletedAt == null &&
                x.Status != ArticleStatuses.Deleted, ct)
            ?? throw new NotFoundException("The target article was not found.");
        if (source.LocaleCode == target.LocaleCode)
            throw new BusinessRuleException("Source and target articles must use different locales.");
        if (source.TranslationGroupId != target.TranslationGroupId)
            throw new ConflictException("Source and target articles are not linked translations.");
        if (!await db.KbLanguages.AsNoTracking().AnyAsync(x => x.LocaleCode == target.LocaleCode && x.IsEnabled, ct))
            throw new BusinessRuleException("The target language is not enabled.");
        if (source.Status == ArticleStatuses.Archived || target.Status == ArticleStatuses.Archived)
            throw new ConflictException("Archived articles cannot be automatically translated.");
        var targetDraft = target.CurrentDraftIdFkNavigation
            ?? throw new ConflictException("The target article does not have a current draft.");
        if (targetDraft.Status is not (ArticleStatuses.Draft or ArticleStatuses.ChangesRequested))
            throw new ConflictException("The target draft is not in an editable workflow state.");
        if (targetDraft.IsLocked)
            throw new ConflictException("The target draft is locked. Release the lock before automatic translation.");
        if (target.ArticleTranslationMetadata is null)
            throw new ConflictException("The target article does not have translation metadata.");

        var version = source.LastPublishedVersionIdFkNavigation;
        var sourceDraft = source.CurrentDraftIdFkNavigation
            ?? throw new ConflictException("The source article does not have a current saved draft.");
        return new(source.ArticleId, source.LocaleCode, source.Title, source.UpdatedAt,
            version?.VersionId, version?.VersionNumber, sourceDraft.DraftId, sourceDraft.RowVersion.ToArray(),
            sourceDraft.ContentJsonStoragePath,
            target.ArticleId, target.LocaleCode, targetDraft.DraftId, targetDraft.RowVersion.ToArray(),
            targetDraft.ContentJsonStoragePath, targetDraft.RenderedHtmlStoragePath, targetDraft.PlainTextStoragePath);
    }

    public async Task<AutomaticTranslationCommitResult> CommitAsync(AutomaticTranslationCommit command,
        CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var snapshot = command.Snapshot;
            var source = await db.Articles.Include(x => x.CurrentDraftIdFkNavigation)
                .SingleOrDefaultAsync(x => x.ArticleId == snapshot.SourceArticleId && x.DeletedAt == null &&
                    x.Status != ArticleStatuses.Deleted, ct)
                ?? throw new NotFoundException("The source article was not found.");
            if (source.Title != snapshot.SourceTitle || source.UpdatedAt != snapshot.SourceUpdatedAt ||
                source.LastPublishedVersionIdFk != snapshot.SourceVersionId)
                throw new ConcurrencyConflictException("The source article changed during translation.");
            if (source.CurrentDraftIdFkNavigation?.DraftId != snapshot.SourceDraftId ||
                source.CurrentDraftIdFkNavigation?.RowVersion.AsSpan()
                    .SequenceEqual(snapshot.SourceDraftRowVersion ?? []) != true)
                throw new ConcurrencyConflictException("The source draft changed during translation.");

            var target = await db.Articles.Include(x => x.CurrentDraftIdFkNavigation)
                .Include(x => x.ArticleTranslationMetadata)
                .SingleOrDefaultAsync(x => x.ArticleId == snapshot.TargetArticleId && x.DeletedAt == null &&
                    x.Status != ArticleStatuses.Deleted, ct)
                ?? throw new NotFoundException("The target article was not found.");
            if (target.TranslationGroupId != source.TranslationGroupId || target.LocaleCode != snapshot.TargetLocaleCode)
                throw new ConcurrencyConflictException("The translation relationship changed during translation.");
            var previousDraft = target.CurrentDraftIdFkNavigation;
            if (previousDraft is null || previousDraft.DraftId != snapshot.TargetDraftId ||
                !previousDraft.RowVersion.AsSpan().SequenceEqual(snapshot.TargetDraftRowVersion))
                throw new ConcurrencyConflictException("The target draft changed during translation.");
            if (previousDraft.IsLocked)
                throw new ConflictException("The target draft was locked during translation.");
            if (previousDraft.Status is not (ArticleStatuses.Draft or ArticleStatuses.ChangesRequested))
                throw new ConflictException("The target draft is no longer editable.");
            var metadata = target.ArticleTranslationMetadata
                ?? throw new ConflictException("The target article does not have translation metadata.");

            var nextDraftNumber = (await db.ArticleDrafts.Where(x => x.ArticleIdFk == target.ArticleId)
                .MaxAsync(x => (int?)x.DraftNumber, ct) ?? 0) + 1;
            var draft = new ArticleDraft
            {
                DraftId = Guid.NewGuid(), ArticleIdFk = target.ArticleId, DraftNumber = nextDraftNumber,
                ContentJsonStoragePath = command.ContentJsonPath, ContentHash = command.ContentHash,
                ContentSizeBytes = command.ContentSizeBytes, RowVersion = db.Database.IsSqlServer()
                    ? null! : Guid.NewGuid().ToByteArray(), IsLocked = false, CreatedByFk = command.ActorId,
                UpdatedByFk = command.ActorId, CreatedAt = command.TranslatedAt,
                UpdatedAt = command.TranslatedAt, Status = ArticleStatuses.Draft
            };
            await AddDraftAsync(draft, ct);
            await SynchronizeMediaReferencesAsync(target.ArticleId, draft.DraftId, command.MediaIds, ct);
            target.Title = command.TranslatedTitle;
            target.UpdatedAt = command.TranslatedAt;
            target.CurrentDraftIdFk = draft.DraftId;
            if (target.Status != ArticleStatuses.Published) target.Status = ArticleStatuses.Draft;
            metadata.SourceArticleId = source.ArticleId;
            metadata.SourceVersionId = snapshot.SourceVersionId;
            metadata.SourceVersionNumber = snapshot.SourceVersionNumber;
            metadata.TranslationMethod = ArticleTranslationMethods.Automatic;
            metadata.TranslationStatus = ArticleTranslationStatuses.NeedsVerification;
            metadata.LastTranslatedAt = command.TranslatedAt;
            metadata.VerifiedAt = null;
            metadata.VerifiedByUserId = null;
            db.ArticleAuditLogs.Add(new ArticleAuditLog
            {
                AuditLogId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
                ArticleIdFk = target.ArticleId, ActorIdFk = command.ActorId,
                ActionType = ArticleAuditActions.TranslationAutomaticallyGenerated,
                EntityType = ArticleAuditEntityTypes.Draft, EntityId = draft.DraftId,
                MetaDataJson = JsonSerializer.Serialize(new
                {
                    sourceArticleId = source.ArticleId, snapshot.SourceVersionId, snapshot.SourceVersionNumber,
                    provider = command.ProviderName, translatedSegmentCount = command.SegmentCount,
                    command.ContentHash
                }),
                CreatedAt = command.TranslatedAt
            });
            if (target.Status != ArticleStatuses.Published)
                await SearchIndexJobQueue.EnqueueArticleAsync(db, target.ArticleId, SearchIndexJobTypes.Upsert,
                    command.TranslatedAt.AddSeconds(3), ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new(target.ArticleId, draft.DraftId, target.LocaleCode, target.Title, command.TranslatedAt);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            await Rollback(transaction);
            db.ChangeTracker.Clear();
            throw new ConcurrencyConflictException(exception.Message);
        }
        catch
        {
            await Rollback(transaction);
            db.ChangeTracker.Clear();
            throw;
        }
    }

    private async Task AddDraftAsync(ArticleDraft draft, CancellationToken ct)
    {
        if (db.Database.IsSqlServer())
        {
            db.ArticleDrafts.Add(draft);
            return;
        }
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO ARTICLE_DRAFTS
                (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, ContentHash, ContentSizeBytes,
                 RowVersion, IsLocked, CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
            VALUES ({draft.DraftId}, {draft.ArticleIdFk}, {draft.DraftNumber}, {draft.ContentJsonStoragePath},
                    {draft.ContentHash}, {draft.ContentSizeBytes}, {draft.RowVersion}, {false},
                    {draft.CreatedByFk}, {draft.UpdatedByFk}, {draft.CreatedAt}, {draft.UpdatedAt}, {draft.Status})
            """, ct);
    }

    private async Task SynchronizeMediaReferencesAsync(Guid articleId, Guid draftId,
        IReadOnlyCollection<Guid> mediaIds, CancellationToken ct)
    {
        var desired = mediaIds.ToHashSet();
        if (desired.Count > 0)
        {
            var active = await db.MediaFiles.AsNoTracking()
                .Where(x => desired.Contains(x.MediaId) && x.Status == MediaStatuses.Active)
                .Select(x => x.MediaId).ToListAsync(ct);
            var missing = desired.Except(active).FirstOrDefault();
            if (missing != Guid.Empty)
                throw new ConflictException($"Media file {missing} was not found or is not active.");
        }
        var existing = await db.MediaReferences.Where(x => x.ReferenceEntityType == MediaReferenceTypes.Draft &&
            x.ReferenceEntityId == draftId).ToListAsync(ct);
        db.MediaReferences.RemoveRange(existing.Where(x => !desired.Contains(x.MediaIdFk)));
        var existingIds = existing.Select(x => x.MediaIdFk).ToHashSet();
        foreach (var mediaId in desired.Where(x => !existingIds.Contains(x)))
            db.MediaReferences.Add(new MediaReference
            {
                ReferenceId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(), MediaIdFk = mediaId,
                ArticleIdFk = articleId, ReferenceEntityType = MediaReferenceTypes.Draft,
                ReferenceEntityId = draftId
            });
    }

    private static async Task Rollback(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction)
    { try { await transaction.RollbackAsync(CancellationToken.None); } catch { } }
}
