using System.Text.Json;

namespace Kb.Application.Comments;

public sealed record CommentUserData(Guid Id, string Name);

public sealed record ArticleCommentContextData(
    Guid ArticleId,
    Guid? CurrentDraftId,
    string Status);

public sealed record ArticleCommentData(
    Guid CommentId,
    Guid ArticleId,
    Guid? ParentCommentId,
    string Body,
    Guid? CurrentDraftId,
    Guid? OriginDraftId,
    string? AnchorType,
    JsonElement? AnchorData,
    string AnchorStatus,
    string Status,
    CommentUserData CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    CommentUserData? ResolvedBy,
    DateTime? ResolvedAt,
    DateTime? DeletedAt,
    byte[] RowVersion);

public sealed record ArticleCommentListData(
    IReadOnlyList<ArticleCommentData> Comments,
    bool CanComment,
    bool CanModerate,
    Guid ActorId);

public sealed record CreateArticleCommentCommand(
    string Body,
    Guid? CurrentDraftId,
    string? AnchorType,
    JsonElement? AnchorData);

public sealed record NewArticleCommentData(
    Guid ArticleId,
    Guid? ParentCommentId,
    string Body,
    Guid? CurrentDraftId,
    Guid? OriginDraftId,
    string? AnchorType,
    string? AnchorDataJson,
    string AnchorStatus,
    string Status,
    Guid CreatedById,
    DateTime CreatedAt);

public sealed record CommentAuditData(
    Guid ActorId,
    string Action,
    string MetadataJson,
    DateTime CreatedAt);

public sealed record CommentAnchorUpdate(
    Guid CommentId,
    Guid? DraftId,
    string? AnchorType,
    string? AnchorDataJson,
    string AnchorStatus,
    string PreviousAnchorStatus);

public sealed record CommentAnchorSource(
    Guid CommentId,
    Guid CurrentDraftId,
    string AnchorType,
    string AnchorDataJson,
    string AnchorStatus);
