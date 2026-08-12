namespace Kb.Domain.Constants;

public static class ArticleStatuses
{
    public const string Draft = "Draft";
    public const string SubmittedForReview = "SubmittedForReview";
    public const string InReview = "InReview";
    public const string ChangesRequested = "ChangesRequested";
    public const string Approved = "Approved";
    public const string Published = "Published";

    public const string Archived = "Archived";
    public const string Deleted = "Deleted";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Draft, SubmittedForReview, InReview, ChangesRequested, Approved, Published, Archived, Deleted
    };
}

public static class ArticleDraftStatuses
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        ArticleStatuses.Draft,
        ArticleStatuses.SubmittedForReview,
        ArticleStatuses.InReview,
        ArticleStatuses.ChangesRequested,
        ArticleStatuses.Approved,
        ArticleStatuses.Archived,
        ArticleStatuses.Deleted
    };
}

public static class CategoryStatuses
{
    public const string Active = "Active";
    public const string Archived = "Archived";
}

public static class ReviewActions
{
    public const string SubmitForReview = "SubmitForReview";
    public const string StartReview = "StartReview";
    public const string RequestChanges = "RequestChanges";
    public const string Approve = "Approve";
    public const string Reject = "Reject";
    public const string Publish = "Publish";
    public const string Override = "Override";
    public const string Restore = "Restore";
    public const string Archive = "Archive";
    public const string Unarchive = "Unarchive";
}

public static class NotificationTypes
{
    public const string ArticleSubmittedForReview = "ArticleSubmittedForReview";
    public const string ArticleReviewStarted = "ArticleReviewStarted";
    public const string ArticleApproved = "ArticleApproved";
    public const string ArticleRejected = "ArticleRejected";
    public const string ArticleChangesRequested = "ArticleChangesRequested";
    public const string ArticlePublished = "ArticlePublished";
    public const string ArticleArchived = "ArticleArchived";
    public const string ArticleWorkflowChanged = "ArticleWorkflowChanged";
    public const string ArticleCommented = "ArticleCommented";
    public const string ArticleLockAcquired = "ArticleLockAcquired";
    public const string ArticleLockReleased = "ArticleLockReleased";
    public const string ArticleLockForceReleased = "ArticleLockForceReleased";
}

public static class ArticleSnapshotReasons
{
    public const string SubmittedForReview = "SubmittedForReview";
    public const string Approved = "Approved";
    public const string Published = "Published";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        SubmittedForReview, Approved, Published
    };
}

public static class SearchIndexJobTypes
{
    public const string Upsert = "Upsert";
    public const string Delete = "Delete";
}

public static class ContentBlockTypes
{
    public const string Template = "Template";
    public const string ReusableBlock = "ReusableBlock";
}

public static class JobStatuses
{
    public const string Pending = "Pending";
    public const string Processing = "Processing";
    public const string Completed = "Completed";
    public const string Failed = "Failed";
}

public static class ExportEntityTypes
{
    public const string Article = "Article";
    public const string Category = "Category";
}

public static class ExportTypes
{
    public const string Pdf = "PDF";
    public const string Html = "HTML";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Pdf, Html };
}

public static class MediaStatuses
{
    public const string Temporary = "Temporary";
    public const string Active = "Active";
    public const string Archived = "Archived";
    public const string Deleted = "Deleted";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        Temporary, Active, Archived, Deleted
    };
}

public static class MediaReferenceTypes
{
    public const string Draft = "Draft";
    public const string Version = "Version";
    public const string ReusableBlock = "ReusableBlock";
    public const string Comment = "Comment";
    public const string Attachment = "Attachment";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        Draft, Version, ReusableBlock, Comment, Attachment
    };
}

public static class MediaAuditActions
{
    public const string Uploaded = "MediaUploaded";
    public const string Replaced = "MediaReplaced";
    public const string Archived = "MediaArchived";
    public const string Restored = "MediaRestored";
    public const string Deleted = "MediaDeleted";
}

public static class MediaAuditEntityTypes
{
    public const string Media = "Media";
}

// These codes are shared with the current role seed/frontend matrix. Add a code only when it exists there.
public static class PermissionCodes
{
    public const string ArticlesCreate = "articles.create";
    public const string ArticlesEditOwnDraft = "articles.editOwnDraft";
    public const string ArticlesEditAnyDraft = "articles.editAnyDraft";
    public const string ArticlesSubmitForReview = "articles.submitForReview";
    public const string ArticlesReview = "articles.review";
    public const string ArticlesPublish = "articles.publish";
    public const string ArticlesDelete = "articles.delete";
    public const string CommentsCreate = "comments.create";
    public const string CommentsModerate = "comments.moderate";
    public const string SuggestionsCreate = "suggestions.create";
    public const string CategoriesManage = "categories.manage";
    public const string TemplatesManage = "templates.manage";
    public const string VersionsView = "versions.view";
    public const string VersionsRestore = "versions.restore";
    public const string AuditLogsView = "auditLogs.view";
    public const string LocksManage = "locks.manage";
    public const string UsersManage = "users.manage";
    public const string RolesManage = "roles.manage";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        ArticlesCreate, ArticlesEditOwnDraft, ArticlesEditAnyDraft, ArticlesSubmitForReview,
        ArticlesReview, ArticlesPublish, ArticlesDelete, CommentsCreate, CommentsModerate, SuggestionsCreate,
        CategoriesManage, TemplatesManage, VersionsView, VersionsRestore, AuditLogsView,
        LocksManage, UsersManage, RolesManage
    };
}

public static class CommentThreadStatuses
{
    public const string Open = "Open";
    public const string Resolved = "Resolved";
}

public static class CommentAnchorStatuses
{
    public const string Attached = "Attached";
    public const string NeedsReanchoring = "NeedsReanchoring";
    public const string Orphaned = "Orphaned";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Attached, NeedsReanchoring, Orphaned
    };
}


public static class ClaimNames
{
    // The integration boundary must translate the external SSO subject to USERS.UserID before setting this claim.
    public const string InternalUserId = "kb_user_id";
}

public static class CategoryAuditActions
{
    public const string Created = "CategoryCreated";
    public const string Updated = "CategoryUpdated";
    public const string Moved = "CategoryMoved";
    public const string Deleted = "CategoryDeleted";
    public const string Archived = "CategoryArchived";
    public const string Unarchived = "CategoryUnarchived";
    public const string Reordered = "CategoryReordered";
}

public static class AuditEntityTypes
{
    public const string Category = "Category";
}
