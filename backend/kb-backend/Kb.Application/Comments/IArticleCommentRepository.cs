namespace Kb.Application.Comments;

public interface IArticleCommentRepository
{
    Task<ArticleCommentContextData?> GetArticleContextAsync(Guid articleId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ArticleCommentData>> ListAsync(Guid articleId, CancellationToken cancellationToken);
    Task<ArticleCommentData?> GetAsync(Guid articleId, Guid commentId, CancellationToken cancellationToken);
    Task<ArticleCommentData> InsertAsync(NewArticleCommentData comment, CommentAuditData audit,
        CancellationToken cancellationToken);
    Task<ArticleCommentData> UpdateBodyAsync(Guid articleId, Guid commentId, string body, byte[] rowVersion,
        DateTime updatedAt, CommentAuditData audit, CancellationToken cancellationToken);
    Task SoftDeleteAsync(Guid articleId, Guid commentId, byte[] rowVersion, DateTime deletedAt,
        CommentAuditData audit, CancellationToken cancellationToken);
    Task<ArticleCommentData> SetResolvedAsync(Guid articleId, Guid commentId, bool resolved, Guid actorId,
        byte[] rowVersion, DateTime updatedAt, CommentAuditData audit, CancellationToken cancellationToken);
    Task<IReadOnlyList<CommentAnchorSource>> ListAttachedAnchorsAsync(Guid articleId, Guid draftId,
        CancellationToken cancellationToken);
    Task ApplyAnchorUpdatesAsync(Guid articleId, Guid actorId, IReadOnlyList<CommentAnchorUpdate> updates,
        DateTime updatedAt, CancellationToken cancellationToken);
    Task<bool> HasUnresolvedDraftDependenciesAsync(Guid draftId, CancellationToken cancellationToken);
}
