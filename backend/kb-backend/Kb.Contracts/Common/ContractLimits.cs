namespace Kb.Contracts.Common;

public static class ContractLimits
{
    public const int MaxPermissionCodes = 100;
    public const int MaxNotificationIds = 100;
    public const int MaxTiptapJsonBytes = 2 * 1024 * 1024;
    public const int MaxCommentLength = 20_000;
    public const int MaxReviewCommentLength = 10_000;
}

public static class ContentBlockTypes
{
    public const string Template = "Template";
    public const string ReusableBlock = "ReusableBlock";
}

public static class WorkflowActions
{
    public const string SubmitForReview = "SubmitForReview";
    public const string StartReview = "StartReview";
    public const string RequestChanges = "RequestChanges";
    public const string Resubmit = "Resubmit";
    public const string Approve = "Approve";
    public const string Reject = "Reject";
    public const string Publish = "Publish";
}

public static class WorkflowStatuses
{
    public const string Draft = "Draft";
    public const string SubmittedForReview = "SubmittedForReview";
    public const string InReview = "InReview";
    public const string ChangesRequested = "ChangesRequested";
    public const string Resubmitted = "Resubmitted";
    public const string Approved = "Approved";
    public const string Published = "Published";
}

public static class ExportTypes
{
    public const string Pdf = "PDF";
    public const string Html = "HTML";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Pdf, Html };
}

public static class CommentAnchorTypes
{
    public const string TextRange = "TextRange";
    public const string Block = "Block";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { TextRange, Block };
}

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
        ArticlesReview, ArticlesPublish, ArticlesDelete, CommentsCreate, SuggestionsCreate,
        CategoriesManage, TemplatesManage, VersionsView, VersionsRestore, AuditLogsView,
        LocksManage, UsersManage, RolesManage
    };
}
