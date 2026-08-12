using System.Text.Json;
using Kb.Application.Articles;

namespace Kb.Application.Lifecycle;

public sealed record LifecycleDraftData(
    Guid DraftId,
    Guid ArticleId,
    Guid ArticleOwnerId,
    int DraftNumber,
    string ArticleStatus,
    string DraftStatus,
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string? ContentHash,
    long ContentSizeBytes,
    byte[] RowVersion,
    bool IsLocked,
    Guid? LockedById,
    Guid CreatedById,
    DateTime UpdatedAt,
    string? ArchivedFromStatus,
    bool IsDeleted);

public sealed record LifecycleVersionData(
    Guid VersionId,
    Guid ArticleId,
    int VersionNumber,
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string? ContentHash,
    long ContentSizeBytes,
    Guid? SourceDraftId,
    int? SourceDraftNumber,
    string SnapshotReason);

public sealed record LifecycleVersionSummaryData(
    Guid VersionId,
    Guid ArticleId,
    int VersionNumber,
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string? ContentHash,
    long ContentSizeBytes,
    Guid? SourceDraftId,
    int? SourceDraftNumber,
    string SnapshotReason,
    bool IsPublished,
    UserReference CreatedBy,
    DateTime CreatedAt,
    UserReference? PublishedBy,
    DateTime? PublishedAt);

public sealed record PagedLifecycleVersionData(
    IReadOnlyList<LifecycleVersionSummaryData> Items,
    int Page,
    int PageSize,
    long TotalCount);

public sealed record LifecycleReviewEventData(
    Guid ReviewEventId,
    Guid ArticleId,
    Guid? DraftId,
    string? FromStatus,
    string ToStatus,
    string Action,
    UserReference Actor,
    string? Comment,
    DateTime CreatedAt);

public sealed record LifecyclePermissionsData(
    bool CanEdit,
    bool CanSubmitForReview,
    bool CanReview,
    bool CanRequestChanges,
    bool CanApprove,
    bool CanPublish,
    bool CanDelete,
    bool CanViewVersionHistory,
    bool CanRestoreVersion,
    bool CanLock,
    bool CanUnlock,
    bool CanComment,
    bool CanSuggest,
    bool CanOverrideWorkflow,
    IReadOnlyList<string> WorkflowOverrideTargets);

public sealed record LifecycleVersionDetailsData(
    LifecycleVersionSummaryData Version,
    string PlainText,
    string? RenderedHtml);

public sealed record LifecyclePublishedVersionData(
    LifecycleVersionSummaryData Version,
    JsonElement Content);

public sealed record VersionDiffSegmentData(string ChangeType, string Text);

public sealed record VersionDiffEntryData(
    string ChangeType,
    string BlockType,
    string BlockLabel,
    int? BeforePosition,
    int? AfterPosition,
    string? BeforeText,
    string? AfterText,
    IReadOnlyList<VersionDiffSegmentData> Segments);

public sealed record LifecycleVersionComparisonData(
    LifecycleVersionSummaryData BaseVersion,
    LifecycleVersionSummaryData TargetVersion,
    IReadOnlyList<VersionDiffEntryData> Changes,
    int AddedCount,
    int RemovedCount,
    int ChangedCount,
    int UnchangedCount);

public sealed record LifecycleResultData(
    Guid ArticleId,
    Guid DraftId,
    string Status,
    byte[] RowVersion,
    Guid? PublishedVersionId,
    int? PublishedVersionNumber,
    DateTime ChangedAt);

public sealed record LifecycleAuditData(
    Guid ActorId,
    string Action,
    string MetadataJson,
    DateTime CreatedAt);

public sealed record LifecycleReviewData(
    Guid ActorId,
    string Action,
    string? Comment,
    string FromStatus,
    string ToStatus,
    DateTime CreatedAt);

public sealed record VersionSnapshotContentData(
    Guid VersionId,
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string? ContentHash,
    long ContentSizeBytes,
    string SnapshotReason);

public sealed record RestoredDraftContentData(
    Guid DraftId,
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string? ContentHash,
    long ContentSizeBytes,
    Guid SourceVersionId,
    int SourceVersionNumber);

public sealed record LifecycleCommand(
    byte[] RowVersion,
    string? Comment = null,
    IReadOnlyCollection<Guid>? AdditionalRecipientIds = null);
public sealed record WorkflowOverrideCommand(
    string TargetStatus,
    string Reason,
    byte[] RowVersion,
    IReadOnlyCollection<Guid>? AdditionalRecipientIds = null);
public sealed record RestoreArticleVersionCommand(byte[] RowVersion);
