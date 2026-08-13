namespace Kb.Contracts.Common;

public static class ContractLimits
{
    public const int MaxPermissionCodes = 100;
    public const int MaxNotificationIds = 100;
    public const int MaxAdditionalNotificationRecipients = 100;
    public const int MaxDashboardBulkItems = 100;
    public const int MaxTiptapJsonBytes = 2 * 1024 * 1024;
    public const int MaxCommentLength = 20_000;
    public const int MaxReviewCommentLength = 10_000;
}

public static class ContentBlockTypes
{
    public const string Template = Kb.Domain.Constants.ContentBlockTypes.Template;
    public const string ReusableBlock = Kb.Domain.Constants.ContentBlockTypes.ReusableBlock;
}

public static class WorkflowActions
{
    public const string SubmitForReview = Kb.Domain.Constants.ReviewActions.SubmitForReview;
    public const string StartReview = Kb.Domain.Constants.ReviewActions.StartReview;
    public const string RequestChanges = Kb.Domain.Constants.ReviewActions.RequestChanges;
    public const string Approve = Kb.Domain.Constants.ReviewActions.Approve;
    public const string Reject = Kb.Domain.Constants.ReviewActions.Reject;
    public const string Publish = Kb.Domain.Constants.ReviewActions.Publish;
}

public static class WorkflowStatuses
{
    public const string Draft = Kb.Domain.Constants.ArticleStatuses.Draft;
    public const string SubmittedForReview = Kb.Domain.Constants.ArticleStatuses.SubmittedForReview;
    public const string InReview = Kb.Domain.Constants.ArticleStatuses.InReview;
    public const string ChangesRequested = Kb.Domain.Constants.ArticleStatuses.ChangesRequested;
    public const string Approved = Kb.Domain.Constants.ArticleStatuses.Approved;
    public const string Published = Kb.Domain.Constants.ArticleStatuses.Published;
    public const string Archived = Kb.Domain.Constants.ArticleStatuses.Archived;
    public const string Deleted = Kb.Domain.Constants.ArticleStatuses.Deleted;
}

public static class ExportTypes
{
    public const string Pdf = Kb.Domain.Constants.ExportTypes.Pdf;
    public const string Html = Kb.Domain.Constants.ExportTypes.Html;
    public static readonly IReadOnlySet<string> All = Kb.Domain.Constants.ExportTypes.All;
}

public static class ExportSourceTypes
{
    public const string Draft = Kb.Domain.Constants.ExportSourceTypes.Draft;
    public const string Version = Kb.Domain.Constants.ExportSourceTypes.Version;
    public static readonly IReadOnlySet<string> All = Kb.Domain.Constants.ExportSourceTypes.All;
}

public static class CommentAnchorTypes
{
    public const string TextRange = "TextRange";
    public const string Block = "Block";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { TextRange, Block };
}

public static class CommentAnchorStatuses
{
    public const string Attached = Kb.Domain.Constants.CommentAnchorStatuses.Attached;
    public const string NeedsReanchoring = Kb.Domain.Constants.CommentAnchorStatuses.NeedsReanchoring;
    public const string Orphaned = Kb.Domain.Constants.CommentAnchorStatuses.Orphaned;
    public static readonly IReadOnlySet<string> All = Kb.Domain.Constants.CommentAnchorStatuses.All;
}

public static class PermissionCodes
{
    public const string ArticlesCreate = Kb.Domain.Constants.PermissionCodes.ArticlesCreate;
    public const string ArticlesEditOwnDraft = Kb.Domain.Constants.PermissionCodes.ArticlesEditOwnDraft;
    public const string ArticlesEditAnyDraft = Kb.Domain.Constants.PermissionCodes.ArticlesEditAnyDraft;
    public const string ArticlesSubmitForReview = Kb.Domain.Constants.PermissionCodes.ArticlesSubmitForReview;
    public const string ArticlesReview = Kb.Domain.Constants.PermissionCodes.ArticlesReview;
    public const string ArticlesPublish = Kb.Domain.Constants.PermissionCodes.ArticlesPublish;
    public const string ArticlesDelete = Kb.Domain.Constants.PermissionCodes.ArticlesDelete;
    public const string CommentsCreate = Kb.Domain.Constants.PermissionCodes.CommentsCreate;
    public const string CommentsModerate = Kb.Domain.Constants.PermissionCodes.CommentsModerate;
    public const string SuggestionsCreate = Kb.Domain.Constants.PermissionCodes.SuggestionsCreate;
    public const string CategoriesManage = Kb.Domain.Constants.PermissionCodes.CategoriesManage;
    public const string TemplatesManage = Kb.Domain.Constants.PermissionCodes.TemplatesManage;
    public const string VersionsView = Kb.Domain.Constants.PermissionCodes.VersionsView;
    public const string VersionsRestore = Kb.Domain.Constants.PermissionCodes.VersionsRestore;
    public const string AuditLogsView = Kb.Domain.Constants.PermissionCodes.AuditLogsView;
    public const string LocksManage = Kb.Domain.Constants.PermissionCodes.LocksManage;
    public const string UsersManage = Kb.Domain.Constants.PermissionCodes.UsersManage;
    public const string RolesManage = Kb.Domain.Constants.PermissionCodes.RolesManage;

    public static readonly IReadOnlySet<string> All = Kb.Domain.Constants.PermissionCodes.All;
}
