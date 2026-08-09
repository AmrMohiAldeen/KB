namespace Kb.Application.Media;

public interface IMediaRepository
{
    Task<PagedMediaData> GetPagedAsync(MediaListQuery query, CancellationToken cancellationToken);
    Task<MediaFileData?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> ActiveUserExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<MediaFileData> InsertWithAuditAsync(NewMediaData media, MediaAuditData audit,
        CancellationToken cancellationToken);
    Task<MediaFileData> SetStatusWithAuditAsync(Guid id, string expectedStatus, string newStatus,
        MediaAuditData audit, CancellationToken cancellationToken);
    Task<MediaFileData> ReplaceWithAuditAsync(Guid id, string expectedStoragePath,
        ReplacementMediaData replacement, MediaAuditData audit, CancellationToken cancellationToken);
    Task<IReadOnlyList<MediaReferenceDetailsData>> GetReferencesAsync(Guid mediaId,
        CancellationToken cancellationToken);
    Task<MediaReferenceTargetData?> ResolveReferenceTargetAsync(string entityType, Guid entityId,
        CancellationToken cancellationToken);
    Task<MediaReferenceTargetData?> GetCurrentDraftTargetAsync(Guid articleId,
        CancellationToken cancellationToken);
    Task<MediaReferenceData> AddReferenceAsync(Guid mediaId, MediaReferenceTargetData target,
        CancellationToken cancellationToken);
    Task<MediaReferenceData?> GetReferenceAsync(Guid mediaId, Guid referenceId,
        CancellationToken cancellationToken);
    Task RemoveReferenceAsync(Guid mediaId, Guid referenceId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MediaReferenceData>> SynchronizeReferencesAsync(
        IReadOnlyCollection<Guid> mediaIds,
        MediaReferenceTargetData target,
        CancellationToken cancellationToken);
}
