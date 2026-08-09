using System.Data;
using Kb.Application.Exceptions;
using Kb.Application.Media;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Media;

public sealed class MediaRepository(KbDbContext dbContext) : IMediaRepository
{
    public async Task<PagedMediaData> GetPagedAsync(MediaListQuery query,
        CancellationToken cancellationToken)
    {
        var source = dbContext.MediaFiles.AsNoTracking().AsQueryable();
        source = query.Status is null
            ? source.Where(media => media.Status != MediaStatuses.Deleted)
            : source.Where(media => media.Status == query.Status);
        if (query.Search is not null)
            source = source.Where(media => media.OriginalFileName.Contains(query.Search));
        if (query.Kind is { } kind)
            source = FilterByKind(source, kind);

        var totalCount = await source.LongCountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(query.Page - 1) * query.PageSize, int.MaxValue);
        var items = await Project(source.OrderByDescending(media => media.UploadedAt)
                .ThenByDescending(media => media.MediaId))
            .Skip(skip).Take(query.PageSize).ToListAsync(cancellationToken);
        return new(items, query.Page, query.PageSize, totalCount);
    }

    public Task<MediaFileData?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        Project(dbContext.MediaFiles.AsNoTracking().Where(media => media.MediaId == id))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<bool> ActiveUserExistsAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Users.AsNoTracking().AnyAsync(user => user.UserId == id && user.IsActive,
            cancellationToken);

    public async Task<MediaFileData> InsertWithAuditAsync(NewMediaData media, MediaAuditData audit,
        CancellationToken cancellationToken)
    {
        dbContext.MediaFiles.Add(new MediaFile
        {
            MediaId = media.Id,
            OriginalFileName = media.OriginalFileName,
            StoredFileName = media.StoredFileName,
            MimeType = media.MimeType,
            FileExtension = media.FileExtension,
            FileSizeBytes = media.FileSizeBytes,
            StoragePath = media.StoragePath,
            AccessUrl = null,
            Status = MediaStatuses.Active,
            UploadedByFk = media.UploadedBy,
            UploadedAt = media.UploadedAt
        });
        AddAudit(media.Id, audit);
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return await GetByIdAsync(media.Id, cancellationToken)
            ?? throw new ConflictException("The uploaded media metadata could not be read back.");
    }

    public async Task<MediaFileData> SetStatusWithAuditAsync(Guid id, string expectedStatus,
        string newStatus, MediaAuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.MediaFiles.SingleOrDefaultAsync(media => media.MediaId == id,
            cancellationToken) ?? throw new NotFoundException("The media file was not found.");
        if (!string.Equals(entity.Status, expectedStatus, StringComparison.Ordinal))
            throw new ConflictException("The media status changed while the operation was in progress.");
        entity.Status = newStatus;
        AddAudit(id, audit);
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return await GetByIdAsync(id, cancellationToken)
            ?? throw new ConflictException("The changed media metadata could not be read back.");
    }

    public async Task<MediaFileData> ReplaceWithAuditAsync(Guid id, string expectedStoragePath,
        ReplacementMediaData replacement, MediaAuditData audit, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        var entity = await dbContext.MediaFiles.SingleOrDefaultAsync(media => media.MediaId == id,
            cancellationToken) ?? throw new NotFoundException("The media file was not found.");
        if (!string.Equals(entity.Status, MediaStatuses.Active, StringComparison.Ordinal))
            throw new ConflictException("Only active media can be replaced.");
        if (!string.Equals(entity.StoragePath, expectedStoragePath, StringComparison.Ordinal))
            throw new ConflictException("The media file changed while the replacement was in progress.");

        entity.OriginalFileName = replacement.OriginalFileName;
        entity.StoredFileName = replacement.StoredFileName;
        entity.MimeType = replacement.MimeType;
        entity.FileExtension = replacement.FileExtension;
        entity.FileSizeBytes = replacement.FileSizeBytes;
        entity.StoragePath = replacement.StoragePath;
        entity.AccessUrl = null;
        entity.UploadedByFk = replacement.UploadedBy;
        entity.UploadedAt = replacement.UploadedAt;
        AddAudit(id, audit);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return await GetByIdAsync(id, cancellationToken)
            ?? throw new ConflictException("The replaced media metadata could not be read back.");
    }

    public async Task<IReadOnlyList<MediaReferenceDetailsData>> GetReferencesAsync(Guid mediaId,
        CancellationToken cancellationToken) =>
        await dbContext.MediaReferences.AsNoTracking()
            .Where(reference => reference.MediaIdFk == mediaId)
            .OrderBy(reference => reference.ArticleIdFkNavigation == null
                ? string.Empty
                : reference.ArticleIdFkNavigation.Title)
            .ThenBy(reference => reference.ReferenceEntityType)
            .ThenBy(reference => reference.ReferenceEntityId)
            .Select(reference => new MediaReferenceDetailsData(
                reference.ReferenceId,
                reference.MediaIdFk,
                reference.ArticleIdFk,
                reference.ArticleIdFkNavigation == null ? null : reference.ArticleIdFkNavigation.Title,
                reference.ArticleIdFkNavigation == null ? null : reference.ArticleIdFkNavigation.Slug,
                reference.ArticleIdFkNavigation == null ? null : reference.ArticleIdFkNavigation.Status,
                reference.ReferenceEntityType,
                reference.ReferenceEntityId,
                reference.ReferenceEntityType == MediaReferenceTypes.Version
                    ? dbContext.ArticleVersions
                        .Where(version => version.VersionId == reference.ReferenceEntityId)
                        .Select(version => (int?)version.VersionNumber)
                        .SingleOrDefault()
                    : null))
            .ToListAsync(cancellationToken);

    public Task<MediaReferenceTargetData?> ResolveReferenceTargetAsync(string entityType, Guid entityId,
        CancellationToken cancellationToken) => entityType switch
    {
        MediaReferenceTypes.Draft => dbContext.ArticleDrafts.AsNoTracking()
            .Where(draft => draft.DraftId == entityId)
            .Select(draft => new MediaReferenceTargetData(MediaReferenceTypes.Draft, draft.DraftId,
                draft.ArticleIdFk, draft.ArticleIdFkNavigation.AuthorIdFk))
            .SingleOrDefaultAsync(cancellationToken),
        MediaReferenceTypes.Version => dbContext.ArticleVersions.AsNoTracking()
            .Where(version => version.VersionId == entityId)
            .Select(version => new MediaReferenceTargetData(MediaReferenceTypes.Version, version.VersionId,
                version.ArticleIdFk, version.ArticleIdFkNavigation.AuthorIdFk))
            .SingleOrDefaultAsync(cancellationToken),
        MediaReferenceTypes.ReusableBlock => dbContext.ContentBlocks.AsNoTracking()
            .Where(block => block.ContentBlockId == entityId && block.Type == ContentBlockTypes.ReusableBlock)
            .Select(block => new MediaReferenceTargetData(MediaReferenceTypes.ReusableBlock,
                block.ContentBlockId, null, null))
            .SingleOrDefaultAsync(cancellationToken),
        MediaReferenceTypes.Comment => dbContext.ArticleComments.AsNoTracking()
            .Where(comment => comment.CommentId == entityId && comment.DeletedAt == null)
            .Select(comment => new MediaReferenceTargetData(MediaReferenceTypes.Comment, comment.CommentId,
                comment.ArticleIdFk, comment.ArticleIdFkNavigation.AuthorIdFk))
            .SingleOrDefaultAsync(cancellationToken),
        MediaReferenceTypes.Attachment => dbContext.Articles.AsNoTracking()
            .Where(article => article.ArticleId == entityId && article.DeletedAt == null &&
                              article.Status != ArticleStatuses.Deleted &&
                              article.Status != ArticleStatuses.Archived)
            .Select(article => new MediaReferenceTargetData(MediaReferenceTypes.Attachment,
                article.ArticleId, article.ArticleId, article.AuthorIdFk))
            .SingleOrDefaultAsync(cancellationToken),
        _ => Task.FromResult<MediaReferenceTargetData?>(null)
    };

    public Task<MediaReferenceTargetData?> GetCurrentDraftTargetAsync(Guid articleId,
        CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking()
            .Where(article => article.ArticleId == articleId && article.DeletedAt == null &&
                              article.Status != ArticleStatuses.Deleted &&
                              article.Status != ArticleStatuses.Archived &&
                              article.CurrentDraftIdFk != null)
            .Select(article => new MediaReferenceTargetData(MediaReferenceTypes.Draft,
                article.CurrentDraftIdFk!.Value, article.ArticleId, article.AuthorIdFk))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<MediaReferenceData> AddReferenceAsync(Guid mediaId,
        MediaReferenceTargetData target, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        var existing = await dbContext.MediaReferences.AsNoTracking()
            .Where(reference => reference.MediaIdFk == mediaId &&
                                reference.ReferenceEntityType == target.EntityType &&
                                reference.ReferenceEntityId == target.EntityId)
            .Select(ToReference())
            .SingleOrDefaultAsync(cancellationToken);
        if (existing is not null)
        {
            await transaction.CommitAsync(cancellationToken);
            return existing;
        }

        var entity = new MediaReference
        {
            ReferenceId = NewId(),
            MediaIdFk = mediaId,
            ArticleIdFk = target.ArticleId,
            ReferenceEntityType = target.EntityType,
            ReferenceEntityId = target.EntityId
        };
        dbContext.MediaReferences.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(entity.ReferenceId, entity.MediaIdFk, entity.ArticleIdFk, entity.ReferenceEntityType,
            entity.ReferenceEntityId);
    }

    public Task<MediaReferenceData?> GetReferenceAsync(Guid mediaId, Guid referenceId,
        CancellationToken cancellationToken) =>
        dbContext.MediaReferences.AsNoTracking()
            .Where(reference => reference.MediaIdFk == mediaId && reference.ReferenceId == referenceId)
            .Select(ToReference())
            .SingleOrDefaultAsync(cancellationToken);

    public async Task RemoveReferenceAsync(Guid mediaId, Guid referenceId,
        CancellationToken cancellationToken)
    {
        var reference = await dbContext.MediaReferences.SingleOrDefaultAsync(item =>
            item.MediaIdFk == mediaId && item.ReferenceId == referenceId, cancellationToken);
        if (reference is null) return;
        dbContext.MediaReferences.Remove(reference);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MediaReferenceData>> SynchronizeReferencesAsync(
        IReadOnlyCollection<Guid> mediaIds, MediaReferenceTargetData target,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        var desired = mediaIds.ToHashSet();
        var existing = await dbContext.MediaReferences
            .Where(reference => reference.ReferenceEntityType == target.EntityType &&
                                reference.ReferenceEntityId == target.EntityId)
            .ToListAsync(cancellationToken);

        dbContext.MediaReferences.RemoveRange(existing.Where(reference =>
            !desired.Contains(reference.MediaIdFk)));
        var existingMediaIds = existing.Select(reference => reference.MediaIdFk).ToHashSet();
        foreach (var mediaId in desired.Where(id => !existingMediaIds.Contains(id)))
        {
            dbContext.MediaReferences.Add(new MediaReference
            {
                ReferenceId = NewId(),
                MediaIdFk = mediaId,
                ArticleIdFk = target.ArticleId,
                ReferenceEntityType = target.EntityType,
                ReferenceEntityId = target.EntityId
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await dbContext.MediaReferences.AsNoTracking()
            .Where(reference => reference.ReferenceEntityType == target.EntityType &&
                                reference.ReferenceEntityId == target.EntityId)
            .OrderBy(reference => reference.MediaIdFk)
            .Select(ToReference())
            .ToListAsync(cancellationToken);
    }

    private static IQueryable<MediaFile> FilterByKind(IQueryable<MediaFile> source, MediaKind kind) =>
        kind switch
        {
            MediaKind.Gif => source.Where(media => media.MimeType == "image/gif"),
            MediaKind.Image => source.Where(media => media.MimeType.StartsWith("image/") &&
                                                     media.MimeType != "image/gif"),
            MediaKind.Video => source.Where(media => media.MimeType.StartsWith("video/")),
            MediaKind.Pdf => source.Where(media => media.MimeType == "application/pdf"),
            _ => source.Where(media => !media.MimeType.StartsWith("image/") &&
                                       !media.MimeType.StartsWith("video/") &&
                                       media.MimeType != "application/pdf")
        };

    private static IQueryable<MediaFileData> Project(IQueryable<MediaFile> source) =>
        source.Select(media => new MediaFileData(
            media.MediaId,
            media.OriginalFileName,
            media.StoredFileName,
            media.MimeType,
            media.FileExtension,
            media.FileSizeBytes,
            media.StoragePath,
            media.Status,
            new MediaUserData(media.UploadedByFkNavigation.UserId,
                media.UploadedByFkNavigation.FullName),
            media.UploadedAt,
            media.MediaReferences.Count));

    private static System.Linq.Expressions.Expression<Func<MediaReference, MediaReferenceData>>
        ToReference() => reference => new MediaReferenceData(reference.ReferenceId, reference.MediaIdFk,
            reference.ArticleIdFk, reference.ReferenceEntityType, reference.ReferenceEntityId);

    private void AddAudit(Guid mediaId, MediaAuditData audit) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = NewId(),
            ArticleIdFk = audit.ArticleId,
            ActorIdFk = audit.ActorId,
            ActionType = audit.Action,
            EntityType = MediaAuditEntityTypes.Media,
            EntityId = mediaId,
            MetaDataJson = audit.MetadataJson,
            CreatedAt = audit.CreatedAt
        });

    private Guid NewId() => dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid();
}
