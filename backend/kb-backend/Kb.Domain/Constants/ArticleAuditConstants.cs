namespace Kb.Domain.Constants;

public static class ArticleAuditActions
{
    public const string Created = "ArticleCreated";
    public const string Updated = "ArticleMetadataUpdated";
    public const string Reordered = "ArticleReordered";
    public const string Archived = "ArticleArchived";
    public const string Unarchived = "ArticleUnarchived";
    public const string Deleted = "ArticleDeleted";
    public const string DraftLockAcquired = "ArticleDraftLockAcquired";
    public const string DraftLockReleased = "ArticleDraftLockReleased";
    public const string DraftLockForceReleased = "ArticleDraftLockForceReleased";
    public const string DraftContentSaved = "ArticleDraftContentSaved";
    public const string SubmittedForReview = "ArticleSubmittedForReview";
    public const string ReviewStarted = "ArticleReviewStarted";
    public const string ChangesRequested = "ArticleChangesRequested";
    public const string Resubmitted = "ArticleResubmitted";
    public const string Approved = "ArticleApproved";
    public const string Rejected = "ArticleRejected";
    public const string Published = "ArticlePublished";
    public const string VersionCreated = "ArticleVersionCreated";
    public const string Restored = "ArticleRestored";
    public const string WorkflowOverridden = "ArticleWorkflowOverridden";
    public const string CommentCreated = "ArticleCommentCreated";
    public const string CommentReplied = "ArticleCommentReplied";
    public const string CommentUpdated = "ArticleCommentUpdated";
    public const string CommentDeleted = "ArticleCommentDeleted";
    public const string CommentResolved = "ArticleCommentResolved";
    public const string CommentReopened = "ArticleCommentReopened";
    public const string CommentAnchorChanged = "ArticleCommentAnchorChanged";
}

public static class ArticleAuditEntityTypes
{
    public const string Article = "Article";
    public const string Draft = "ArticleDraft";
    public const string Version = "ArticleVersion";
    public const string Comment = "ArticleComment";
}
