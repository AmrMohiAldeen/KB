namespace Kb.Domain.Constants;

public static class ArticleAuditActions
{
    public const string Created = "ArticleCreated";
    public const string Updated = "ArticleMetadataUpdated";
    public const string Deleted = "ArticleDeleted";
    public const string DraftLockAcquired = "ArticleDraftLockAcquired";
    public const string DraftLockReleased = "ArticleDraftLockReleased";
    public const string DraftLockForceReleased = "ArticleDraftLockForceReleased";
    public const string DraftContentSaved = "ArticleDraftContentSaved";
}

public static class ArticleAuditEntityTypes
{
    public const string Article = "Article";
    public const string Draft = "ArticleDraft";
}
