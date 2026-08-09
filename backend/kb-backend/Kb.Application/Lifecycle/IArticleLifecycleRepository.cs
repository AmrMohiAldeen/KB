namespace Kb.Application.Lifecycle;

public interface IArticleLifecycleRepository
{
    Task<LifecycleDraftData?> GetCurrentAsync(Guid articleId, CancellationToken cancellationToken);

    Task<LifecycleVersionData?> GetVersionAsync(
        Guid articleId,
        Guid versionId,
        CancellationToken cancellationToken);

    Task<PagedLifecycleVersionData> GetVersionsAsync(
        Guid articleId,
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<LifecycleVersionSummaryData?> GetVersionSummaryAsync(
        Guid articleId,
        Guid versionId,
        CancellationToken cancellationToken);

    Task<LifecycleVersionSummaryData?> GetPublishedVersionAsync(
        Guid articleId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<LifecycleReviewEventData>> GetReviewHistoryAsync(
        Guid articleId,
        CancellationToken cancellationToken);

    Task<LifecycleResultData> TransitionAsync(
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
        CancellationToken cancellationToken);

    Task<LifecycleResultData> PublishAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        VersionSnapshotContentData content,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        LifecycleAuditData snapshotAudit,
        CancellationToken cancellationToken);

    Task<LifecycleResultData> RestoreAsync(
        Guid articleId,
        Guid currentDraftId,
        byte[] expectedRowVersion,
        Guid sourceVersionId,
        RestoredDraftContentData content,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        CancellationToken cancellationToken);

    Task ArchiveAsync(
        Guid articleId,
        Guid draftId,
        byte[] expectedRowVersion,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        CancellationToken cancellationToken);

    Task<LifecycleResultData> UnarchiveAsync(
        Guid articleId,
        Guid draftId,
        LifecycleReviewData review,
        LifecycleAuditData audit,
        CancellationToken cancellationToken);
}
