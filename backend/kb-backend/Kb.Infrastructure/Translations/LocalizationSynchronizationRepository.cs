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

public sealed class LocalizationSynchronizationRepository(KbDbContext db)
    : ILocalizationSynchronizationRepository
{
    public async Task<LocalizationSyncPlan> GetPlanAsync(Guid sourceArticleId,
        IReadOnlyCollection<string> targetLocaleCodes, CancellationToken ct)
    {
        var source = await db.Articles.AsNoTracking()
            .Include(x => x.ArticleTranslationMetadata)
            .Include(x => x.LastPublishedVersionIdFkNavigation)
            .Include(x => x.ArticleCategories)
            .SingleOrDefaultAsync(x => x.ArticleId == sourceArticleId && x.DeletedAt == null &&
                x.Status != ArticleStatuses.Deleted, ct)
            ?? throw new NotFoundException("The source article was not found.");
        var defaultLocale = await db.KbLanguages.AsNoTracking().Where(x => x.IsDefault && x.IsEnabled)
            .Select(x => x.LocaleCode).SingleOrDefaultAsync(ct)
            ?? throw new ConflictException("An enabled default knowledge-base language is required.");
        if (!string.Equals(source.LocaleCode, defaultLocale, StringComparison.OrdinalIgnoreCase) ||
            source.ArticleTranslationMetadata?.SourceArticleId is not null)
            throw new BusinessRuleException("Synchronization must start from an original article in the default language.");
        var version = source.LastPublishedVersionIdFkNavigation
            ?? throw new ConflictException("Publish the source article before synchronizing translations.");

        var locales = targetLocaleCodes.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var enabled = await db.KbLanguages.AsNoTracking()
            .Where(x => x.IsEnabled && locales.Contains(x.LocaleCode) && x.LocaleCode != source.LocaleCode)
            .Select(x => x.LocaleCode).ToListAsync(ct);
        var unsupported = locales.Where(x => !enabled.Contains(x, StringComparer.OrdinalIgnoreCase)).ToArray();
        if (unsupported.Length > 0)
            throw new BusinessRuleException($"Target languages are not enabled: {string.Join(", ", unsupported)}.");

        var existing = await db.Articles.AsNoTracking()
            .Where(x => x.TranslationGroupId == source.TranslationGroupId && locales.Contains(x.LocaleCode) &&
                x.DeletedAt == null && x.Status != ArticleStatuses.Deleted)
            .Select(x => new
            {
                x.ArticleId, x.LocaleCode, x.CurrentDraftIdFk,
                RowVersion = x.CurrentDraftIdFkNavigation == null ? null : x.CurrentDraftIdFkNavigation.RowVersion,
                SourceVersionId = x.ArticleTranslationMetadata == null ? null : x.ArticleTranslationMetadata.SourceVersionId
            }).ToListAsync(ct);
        var targets = locales.Select(locale =>
        {
            var target = existing.SingleOrDefault(x => string.Equals(x.LocaleCode, locale,
                StringComparison.OrdinalIgnoreCase));
            if (target is null) return new LocalizationSyncTargetSnapshot(locale, null,
                LocalizationSyncStates.Missing, null, null);
            var state = target.SourceVersionId == version.VersionId
                ? LocalizationSyncStates.Current : LocalizationSyncStates.OutOfDate;
            return new LocalizationSyncTargetSnapshot(target.LocaleCode, target.ArticleId, state,
                target.CurrentDraftIdFk, target.RowVersion?.ToArray());
        }).ToArray();
        var categoryIds = source.ArticleCategories.OrderBy(x => x.SortOrder).Select(x => x.CategoryIdFk).ToArray();
        if (categoryIds.Length == 0 && source.CategoryIdFk is { } primary) categoryIds = [primary];
        return new(new(source.ArticleId, source.TranslationGroupId, source.LocaleCode, source.Title, source.Slug,
            source.Visibility, source.CategoryIdFk, categoryIds, version.VersionId, version.VersionNumber,
            version.ContentJsonStoragePath, source.UpdatedAt), targets);
    }

    public async Task<LocalizationSyncCommitResult> CommitAsync(LocalizationSyncCommit command,
        CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var source = await db.Articles.SingleOrDefaultAsync(x => x.ArticleId == command.Source.SourceArticleId &&
                x.DeletedAt == null && x.Status != ArticleStatuses.Deleted, ct)
                ?? throw new NotFoundException("The source article was not found.");
            if (source.LastPublishedVersionIdFk != command.Source.SourceVersionId ||
                source.UpdatedAt != command.Source.SourceUpdatedAt ||
                source.TranslationGroupId != command.Source.TranslationGroupId)
                throw new ConcurrencyConflictException("The published source changed after synchronization preview.");
            if (!await db.KbLanguages.AnyAsync(x => x.LocaleCode == command.TargetLocaleCode && x.IsEnabled, ct))
                throw new BusinessRuleException("The target language is no longer enabled.");
            await ValidateMediaAsync(command.MediaIds, ct);

            Article target;
            ArticleDraft draft;
            if (command.TargetArticleId is null)
            {
                if (await db.Articles.AnyAsync(x => x.TranslationGroupId == source.TranslationGroupId &&
                    x.LocaleCode == command.TargetLocaleCode && x.DeletedAt == null &&
                    x.Status != ArticleStatuses.Deleted, ct))
                    throw new ConflictException("A translation was created after synchronization preview.");
                var articleId = Guid.NewGuid();
                target = new Article
                {
                    ArticleId = articleId, Title = command.Title,
                    Slug = await UniqueSlugAsync($"{source.Slug}-{command.TargetLocaleCode}", ct),
                    CategoryIdFk = command.Source.CategoryId, AuthorIdFk = command.ActorId,
                    Status = ArticleStatuses.Draft, Visibility = command.Source.Visibility,
                    Position = await NextPositionAsync(command.Source.CategoryId, ct),
                    LocaleCode = command.TargetLocaleCode, TranslationGroupId = source.TranslationGroupId,
                    CreatedAt = command.SynchronizedAt, UpdatedAt = command.SynchronizedAt,
                    ArticleTranslationMetadata = Metadata(articleId, source, command)
                };
                db.Articles.Add(target);
                db.ArticleCategories.AddRange(command.Source.CategoryIds.Distinct().Select((categoryId, index) =>
                    new ArticleCategory { ArticleIdFk = articleId, CategoryIdFk = categoryId,
                        IsPrimary = categoryId == command.Source.CategoryId, SortOrder = index }));
                await db.SaveChangesAsync(ct);
                draft = NewDraft(target.ArticleId, 1, command);
                await AddDraftAsync(draft, ct);
                target.CurrentDraftIdFk = draft.DraftId;
            }
            else
            {
                target = await db.Articles.Include(x => x.CurrentDraftIdFkNavigation)
                    .Include(x => x.ArticleTranslationMetadata)
                    .SingleOrDefaultAsync(x => x.ArticleId == command.TargetArticleId && x.DeletedAt == null &&
                        x.Status != ArticleStatuses.Deleted, ct)
                    ?? throw new NotFoundException("The target translation was not found.");
                if (target.TranslationGroupId != source.TranslationGroupId ||
                    target.LocaleCode != command.TargetLocaleCode || target.Status == ArticleStatuses.Archived)
                    throw new ConflictException("The target translation relationship changed after preview.");
                var currentDraft = target.CurrentDraftIdFkNavigation;
                if (currentDraft?.DraftId != command.ExpectedTargetDraftId ||
                    currentDraft is null || command.ExpectedTargetDraftRowVersion is null ||
                    !currentDraft.RowVersion.AsSpan().SequenceEqual(command.ExpectedTargetDraftRowVersion))
                    throw new ConcurrencyConflictException("The target draft changed after synchronization preview.");
                if (currentDraft.IsLocked)
                    throw new ConflictException("Release the target draft lock before synchronizing it.");
                if (currentDraft.Status is not (ArticleStatuses.Draft or ArticleStatuses.ChangesRequested) &&
                    !(target.Status == ArticleStatuses.Published && currentDraft.Status == ArticleStatuses.Approved))
                    throw new ConflictException("The target translation is in an active review workflow and cannot be synchronized.");
                var nextDraftNumber = (await db.ArticleDrafts.Where(x => x.ArticleIdFk == target.ArticleId)
                    .MaxAsync(x => (int?)x.DraftNumber, ct) ?? 0) + 1;
                draft = NewDraft(target.ArticleId, nextDraftNumber, command);
                await AddDraftAsync(draft, ct);
                target.CurrentDraftIdFk = draft.DraftId;
                target.Title = command.Title;
                target.UpdatedAt = command.SynchronizedAt;
                if (target.Status != ArticleStatuses.Published) target.Status = ArticleStatuses.Draft;
                var metadata = target.ArticleTranslationMetadata
                    ?? throw new ConflictException("The target translation metadata is missing.");
                UpdateMetadata(metadata, source, command);
            }

            AddMediaReferences(target.ArticleId, draft.DraftId, command.MediaIds);
            AddAudit(target.ArticleId, draft.DraftId, command);
            if (target.Status != ArticleStatuses.Published)
                await SearchIndexJobQueue.EnqueueArticleAsync(db, target.ArticleId, SearchIndexJobTypes.Upsert,
                    command.SynchronizedAt.AddSeconds(3), ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new(target.ArticleId, draft.DraftId, command.TranslationStatus);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            await RollbackAsync(transaction); db.ChangeTracker.Clear();
            throw new ConcurrencyConflictException(exception.Message);
        }
        catch
        {
            await RollbackAsync(transaction); db.ChangeTracker.Clear(); throw;
        }
    }

    private ArticleTranslationMetadata Metadata(Guid articleId, Article source, LocalizationSyncCommit command)
    {
        var metadata = new ArticleTranslationMetadata { ArticleId = articleId };
        UpdateMetadata(metadata, source, command);
        return metadata;
    }

    private static void UpdateMetadata(ArticleTranslationMetadata metadata, Article source,
        LocalizationSyncCommit command)
    {
        metadata.SourceArticleId = source.ArticleId;
        metadata.SourceVersionId = command.Source.SourceVersionId;
        metadata.SourceVersionNumber = command.Source.SourceVersionNumber;
        metadata.TranslationMethod = command.TranslationMethod;
        metadata.TranslationStatus = command.TranslationStatus;
        metadata.LastTranslatedAt = command.SynchronizedAt;
        metadata.VerifiedAt = null;
        metadata.VerifiedByUserId = null;
    }

    private ArticleDraft NewDraft(Guid articleId, int number, LocalizationSyncCommit command) => new()
    {
        DraftId = Guid.NewGuid(), ArticleIdFk = articleId, DraftNumber = number,
        ContentJsonStoragePath = command.ContentJsonPath, ContentHash = command.ContentHash,
        ContentSizeBytes = command.ContentSizeBytes, RowVersion = db.Database.IsSqlServer()
            ? null! : Guid.NewGuid().ToByteArray(), IsLocked = false, CreatedByFk = command.ActorId,
        UpdatedByFk = command.ActorId, CreatedAt = command.SynchronizedAt,
        UpdatedAt = command.SynchronizedAt, Status = ArticleStatuses.Draft
    };

    private async Task AddDraftAsync(ArticleDraft draft, CancellationToken ct)
    {
        if (db.Database.IsSqlServer())
        {
            db.ArticleDrafts.Add(draft);
            return;
        }
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO ARTICLE_DRAFTS
                (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, RenderedHtmlStoragePath,
                 PlainTextStoragePath, ContentHash, ContentSizeBytes, RowVersion, IsLocked,
                 CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
            VALUES ({draft.DraftId}, {draft.ArticleIdFk}, {draft.DraftNumber}, {draft.ContentJsonStoragePath},
                    {draft.RenderedHtmlStoragePath}, {draft.PlainTextStoragePath}, {draft.ContentHash},
                    {draft.ContentSizeBytes}, {draft.RowVersion}, {draft.IsLocked}, {draft.CreatedByFk},
                    {draft.UpdatedByFk}, {draft.CreatedAt}, {draft.UpdatedAt}, {draft.Status})
            """, ct);
    }

    private void AddMediaReferences(Guid articleId, Guid draftId, IEnumerable<Guid> mediaIds) =>
        db.MediaReferences.AddRange(mediaIds.Distinct().Select(mediaId => new MediaReference
        {
            ReferenceId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(), MediaIdFk = mediaId,
            ArticleIdFk = articleId, ReferenceEntityType = MediaReferenceTypes.Draft,
            ReferenceEntityId = draftId
        }));

    private void AddAudit(Guid articleId, Guid draftId, LocalizationSyncCommit command) =>
        db.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(), ArticleIdFk = articleId,
            ActorIdFk = command.ActorId, ActionType = ArticleAuditActions.LocalizationSynchronized,
            EntityType = ArticleAuditEntityTypes.Draft, EntityId = draftId,
            MetaDataJson = JsonSerializer.Serialize(new
            {
                sourceArticleId = command.Source.SourceArticleId,
                sourceVersionId = command.Source.SourceVersionId,
                sourceVersionNumber = command.Source.SourceVersionNumber,
                command.TargetLocaleCode, command.Operation, command.TranslationMethod,
                command.TranslationStatus, command.ProviderName, command.TranslatedSegmentCount,
                manualDraftContentMayHaveBeenReplaced = command.TargetArticleId is not null
            }),
            CreatedAt = command.SynchronizedAt
        });

    private async Task ValidateMediaAsync(IReadOnlyCollection<Guid> mediaIds, CancellationToken ct)
    {
        if (mediaIds.Count == 0) return;
        var count = await db.MediaFiles.CountAsync(x => mediaIds.Contains(x.MediaId) &&
            x.Status == MediaStatuses.Active, ct);
        if (count != mediaIds.Distinct().Count())
            throw new ConflictException("One or more source media files are unavailable.");
    }

    private async Task<int> NextPositionAsync(Guid? categoryId, CancellationToken ct) =>
        categoryId is null ? 0 : (await db.Articles.Where(x => x.CategoryIdFk == categoryId &&
            x.DeletedAt == null && x.Status != ArticleStatuses.Deleted && x.Status != ArticleStatuses.Archived)
            .MaxAsync(x => (int?)x.Position, ct) ?? -1) + 1;

    private async Task<string> UniqueSlugAsync(string stem, CancellationToken ct)
    {
        stem = stem.Trim().ToLowerInvariant();
        for (var number = 1; ; number++)
        {
            var suffix = number == 1 ? string.Empty : $"-{number}";
            var candidate = stem[..Math.Min(stem.Length, 350 - suffix.Length)] + suffix;
            if (!await db.Articles.AnyAsync(x => x.Slug == candidate && x.DeletedAt == null, ct)) return candidate;
        }
    }

    private static async Task RollbackAsync(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction)
    { try { await transaction.RollbackAsync(CancellationToken.None); } catch { } }
}
