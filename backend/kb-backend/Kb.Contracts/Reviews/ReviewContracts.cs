using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Reviews;

public abstract class OptionalReviewCommentRequest
{
    [NonWhiteSpace, StringLength(ContractLimits.MaxReviewCommentLength)]
    public string? Comment { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public abstract class RequiredReviewCommentRequest
{
    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxReviewCommentLength)]
    public required string Comment { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed class SubmitForReviewRequest : OptionalReviewCommentRequest;
public sealed class StartReviewRequest : OptionalReviewCommentRequest;
public sealed class RequestChangesRequest : RequiredReviewCommentRequest;
public sealed class ResubmitForReviewRequest : OptionalReviewCommentRequest;
public sealed class ApproveArticleRequest : OptionalReviewCommentRequest;
public sealed class RejectArticleRequest : RequiredReviewCommentRequest;
public sealed class PublishArticleRequest : OptionalReviewCommentRequest;

public sealed class WorkflowOverrideRequest
{
    [Required, NonWhiteSpace, StringLength(50)]
    public required string TargetStatus { get; init; }

    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxReviewCommentLength)]
    public required string Reason { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed record ArticleLifecycleResponse(
    Guid ArticleId,
    Guid DraftId,
    string Status,
    string RowVersion,
    Guid? PublishedVersionId,
    int? PublishedVersionNumber,
    DateTime ChangedAt);

public sealed record ArticleReviewEventResponse(
    Guid ReviewEventId,
    Guid ArticleId,
    Guid? DraftId,
    string? FromStatus,
    string ToStatus,
    string Action,
    UserSummaryResponse Actor,
    string? Comment,
    DateTime CreatedAt);
