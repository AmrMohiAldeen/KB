using System.Data;
using System.Data.Common;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Drafts;

public sealed class ArticleDraftRepository(KbDbContext dbContext) : IArticleDraftRepository
{
    public Task<CurrentDraftData?> GetCurrentAsync(Guid articleId, CancellationToken cancellationToken) =>
        CurrentDrafts().Where(draft => draft.ArticleIdFk == articleId)
            .Select(draft => new CurrentDraftData(
                draft.DraftId,
                draft.ArticleIdFk,
                draft.ArticleIdFkNavigation.AuthorIdFk,
                draft.ContentJsonStoragePath,
                draft.RenderedHtmlStoragePath,
                draft.PlainTextStoragePath,
                draft.ContentHash,
                draft.ContentSizeBytes,
                draft.RowVersion,
                draft.Status,
                draft.IsLocked,
                draft.LockedByFkNavigation == null ? null : new DraftUserData(
                    draft.LockedByFkNavigation.UserId, draft.LockedByFkNavigation.FullName),
                draft.LockedAt,
                new DraftUserData(draft.CreatedByFkNavigation.UserId, draft.CreatedByFkNavigation.FullName),
                draft.UpdatedByFkNavigation == null ? null : new DraftUserData(
                    draft.UpdatedByFkNavigation.UserId, draft.UpdatedByFkNavigation.FullName),
                draft.CreatedAt,
                draft.UpdatedAt))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<CurrentDraftData> AcquireLockAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, DateTime changedAt, DraftAuditData audit, CancellationToken cancellationToken) =>
        ExecuteMutationAsync(articleId, draftId, expectedRowVersion, audit,
            async token =>
            {
                var query = MutableDraft(articleId, draftId, expectedRowVersion)
                    .Where(draft => !draft.IsLocked);
                return dbContext.Database.IsSqlServer()
                    ? await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.IsLocked, true)
                        .SetProperty(draft => draft.LockedByFk, actorId)
                        .SetProperty(draft => draft.LockedAt, changedAt)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt), token)
                    : await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.IsLocked, true)
                        .SetProperty(draft => draft.LockedByFk, actorId)
                        .SetProperty(draft => draft.LockedAt, changedAt)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt)
                        .SetProperty(draft => draft.RowVersion, Guid.NewGuid().ToByteArray()), token);
            },
            current => current.IsLocked && current.LockedBy?.Id == actorId,
            current => current.IsLocked
                ? new ConflictException("The draft is locked by another user.")
                : new ConcurrencyConflictException(), cancellationToken);

    public Task<CurrentDraftData> ReleaseLockAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, DateTime changedAt, DraftAuditData audit, CancellationToken cancellationToken) =>
        ExecuteMutationAsync(articleId, draftId, expectedRowVersion, audit,
            async token =>
            {
                var query = MutableDraft(articleId, draftId, expectedRowVersion)
                    .Where(draft => draft.IsLocked && draft.LockedByFk == actorId);
                return dbContext.Database.IsSqlServer()
                    ? await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.IsLocked, false)
                        .SetProperty(draft => draft.LockedByFk, (Guid?)null)
                        .SetProperty(draft => draft.LockedAt, (DateTime?)null)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt), token)
                    : await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.IsLocked, false)
                        .SetProperty(draft => draft.LockedByFk, (Guid?)null)
                        .SetProperty(draft => draft.LockedAt, (DateTime?)null)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt)
                        .SetProperty(draft => draft.RowVersion, Guid.NewGuid().ToByteArray()), token);
            }, null,
            _ => new ConflictException("Only the current draft lock owner can release this lock."),
            cancellationToken);

    public Task<CurrentDraftData> ForceReleaseLockAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, DateTime changedAt, DraftAuditData audit, CancellationToken cancellationToken) =>
        ExecuteMutationAsync(articleId, draftId, expectedRowVersion, audit,
            async token =>
            {
                var query = MutableDraft(articleId, draftId, expectedRowVersion)
                    .Where(draft => draft.IsLocked);
                return dbContext.Database.IsSqlServer()
                    ? await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.IsLocked, false)
                        .SetProperty(draft => draft.LockedByFk, (Guid?)null)
                        .SetProperty(draft => draft.LockedAt, (DateTime?)null)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt), token)
                    : await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.IsLocked, false)
                        .SetProperty(draft => draft.LockedByFk, (Guid?)null)
                        .SetProperty(draft => draft.LockedAt, (DateTime?)null)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt)
                        .SetProperty(draft => draft.RowVersion, Guid.NewGuid().ToByteArray()), token);
            }, null, _ => new ConflictException("The draft is not currently locked."), cancellationToken);

    public Task<CurrentDraftData> SaveContentAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, StagedDraftContent content, IReadOnlyCollection<Guid> mediaIds,
        DateTime changedAt, DraftAuditData audit,
        CancellationToken cancellationToken) =>
        ExecuteMutationAsync(articleId, draftId, expectedRowVersion, audit,
            async token =>
            {
                var query = MutableDraft(articleId, draftId, expectedRowVersion)
                    .Where(draft => draft.IsLocked && draft.LockedByFk == actorId);
                var changed = dbContext.Database.IsSqlServer()
                    ? await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.ContentJsonStoragePath, content.ContentJsonPath)
                        .SetProperty(draft => draft.RenderedHtmlStoragePath, content.RenderedHtmlPath)
                        .SetProperty(draft => draft.PlainTextStoragePath, content.PlainTextPath)
                        .SetProperty(draft => draft.ContentHash, content.ContentHash)
                        .SetProperty(draft => draft.ContentSizeBytes, content.ContentSizeBytes)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt), token)
                    : await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(draft => draft.ContentJsonStoragePath, content.ContentJsonPath)
                        .SetProperty(draft => draft.RenderedHtmlStoragePath, content.RenderedHtmlPath)
                        .SetProperty(draft => draft.PlainTextStoragePath, content.PlainTextPath)
                        .SetProperty(draft => draft.ContentHash, content.ContentHash)
                        .SetProperty(draft => draft.ContentSizeBytes, content.ContentSizeBytes)
                        .SetProperty(draft => draft.UpdatedByFk, actorId)
                        .SetProperty(draft => draft.UpdatedAt, changedAt)
                        .SetProperty(draft => draft.RowVersion, Guid.NewGuid().ToByteArray()), token);
                if (changed == 1)
                    await SynchronizeDraftMediaReferencesAsync(articleId, draftId, mediaIds, token);
                return changed;
            }, null,
            _ => new ConflictException("Only the current draft lock owner can save draft content."),
            cancellationToken);

    private async Task SynchronizeDraftMediaReferencesAsync(
        Guid articleId,
        Guid draftId,
        IReadOnlyCollection<Guid> mediaIds,
        CancellationToken cancellationToken)
    {
        var desired = mediaIds.ToHashSet();
        if (desired.Count > 0)
        {
            var activeIds = await dbContext.MediaFiles.AsNoTracking()
                .Where(media => desired.Contains(media.MediaId) && media.Status == MediaStatuses.Active)
                .Select(media => media.MediaId)
                .ToListAsync(cancellationToken);
            var missing = desired.Except(activeIds).FirstOrDefault();
            if (missing != Guid.Empty)
                throw new ConflictException($"Media file {missing} was not found or is not active.");
        }

        var existing = await dbContext.MediaReferences
            .Where(reference =>
                reference.ReferenceEntityType == MediaReferenceTypes.Draft &&
                reference.ReferenceEntityId == draftId)
            .ToListAsync(cancellationToken);
        dbContext.MediaReferences.RemoveRange(existing.Where(reference =>
            !desired.Contains(reference.MediaIdFk)));

        var existingIds = existing.Select(reference => reference.MediaIdFk).ToHashSet();
        foreach (var mediaId in desired.Where(id => !existingIds.Contains(id)))
        {
            dbContext.MediaReferences.Add(new MediaReference
            {
                ReferenceId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
                MediaIdFk = mediaId,
                ArticleIdFk = articleId,
                ReferenceEntityType = MediaReferenceTypes.Draft,
                ReferenceEntityId = draftId
            });
        }
    }

    private async Task<CurrentDraftData> ExecuteMutationAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        DraftAuditData audit,
        Func<CancellationToken, Task<int>> update,
        Func<CurrentDraftData, bool>? isIdempotent,
        Func<CurrentDraftData, Exception> stateConflict,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        try
        {
            var changed = await update(cancellationToken);
            if (changed != 1)
            {
                var current = await GetCurrentAsync(articleId, cancellationToken)
                    ?? throw new NotFoundException("The article draft was not found.");
                if (!current.RowVersion.AsSpan().SequenceEqual(expectedRowVersion))
                    throw new ConcurrencyConflictException();
                if (isIdempotent?.Invoke(current) == true)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return current;
                }
                throw stateConflict(current);
            }

            AddAudit(articleId, draftId, audit);
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.ChangeTracker.Clear();
            var result = await GetCurrentAsync(articleId, cancellationToken)
                ?? throw new ConcurrencyConflictException("The changed draft could not be read back.");
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch (DbUpdateConcurrencyException)
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw new ConcurrencyConflictException();
        }
        catch (DbException exception) when (
            exception.Message.Contains("locked", StringComparison.OrdinalIgnoreCase) ||
            exception.Message.Contains("busy", StringComparison.OrdinalIgnoreCase))
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw new ConcurrencyConflictException("The draft is being changed by another request.");
        }
        catch
        {
            await RollbackAsync(transaction);
            dbContext.ChangeTracker.Clear();
            throw;
        }
    }

    private IQueryable<ArticleDraft> MutableDraft(Guid articleId, Guid draftId, byte[] expectedRowVersion) =>
        dbContext.ArticleDrafts.Where(draft =>
            draft.DraftId == draftId &&
            draft.ArticleIdFk == articleId &&
            draft.RowVersion == expectedRowVersion &&
            draft.ArticleIdFkNavigation.CurrentDraftIdFk == draftId &&
            draft.ArticleIdFkNavigation.DeletedAt == null &&
            draft.ArticleIdFkNavigation.Status != ArticleStatuses.Deleted);

    private IQueryable<ArticleDraft> CurrentDrafts() => dbContext.ArticleDrafts.AsNoTracking()
        .Where(draft =>
            draft.ArticleIdFkNavigation.CurrentDraftIdFk == draft.DraftId &&
            draft.ArticleIdFkNavigation.DeletedAt == null &&
            draft.ArticleIdFkNavigation.Status != ArticleStatuses.Deleted);

    private void AddAudit(Guid articleId, Guid draftId, DraftAuditData audit) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
            ArticleIdFk = articleId,
            ActorIdFk = audit.ActorId,
            ActionType = audit.Action,
            EntityType = ArticleAuditEntityTypes.Draft,
            EntityId = draftId,
            MetaDataJson = audit.MetadataJson,
            CreatedAt = audit.CreatedAt
        });

    private static async Task RollbackAsync(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction)
    {
        try
        {
            await transaction.RollbackAsync(CancellationToken.None);
        }
        catch
        {
            // Preserve the original mutation exception.
        }
    }
}
