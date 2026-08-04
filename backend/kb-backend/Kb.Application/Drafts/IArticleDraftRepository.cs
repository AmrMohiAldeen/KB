namespace Kb.Application.Drafts;

public interface IArticleDraftRepository
{
    Task<CurrentDraftData?> GetCurrentAsync(Guid articleId, CancellationToken cancellationToken);

    Task<CurrentDraftData> AcquireLockAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, DateTime changedAt, DraftAuditData audit, CancellationToken cancellationToken);

    Task<CurrentDraftData> ReleaseLockAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, DateTime changedAt, DraftAuditData audit, CancellationToken cancellationToken);

    Task<CurrentDraftData> ForceReleaseLockAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, DateTime changedAt, DraftAuditData audit, CancellationToken cancellationToken);

    Task<CurrentDraftData> SaveContentAsync(Guid articleId, Guid draftId, Guid actorId,
        byte[] expectedRowVersion, StagedDraftContent content, IReadOnlyCollection<Guid> mediaIds,
        DateTime changedAt, DraftAuditData audit,
        CancellationToken cancellationToken);
}
