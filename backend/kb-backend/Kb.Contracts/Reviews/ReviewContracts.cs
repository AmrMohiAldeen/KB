using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Reviews;

public abstract class OptionalReviewCommentRequest : IValidatableObject
{
    [NonWhiteSpace, StringLength(ContractLimits.MaxReviewCommentLength)]
    public string? Comment { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }

    [MaxLength(ContractLimits.MaxAdditionalNotificationRecipients)]
    public IReadOnlyList<Guid> AdditionalRecipientIds { get; init; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        ValidateAdditionalRecipients(AdditionalRecipientIds);

    public static IEnumerable<ValidationResult> ValidateAdditionalRecipients(IReadOnlyList<Guid>? ids)
    {
        if (ids is null) yield break;
        if (ids.Any(id => id == Guid.Empty))
            yield return new ValidationResult("Additional recipient IDs must not be empty GUIDs.",
                [nameof(AdditionalRecipientIds)]);
        if (ids.Count != ids.Distinct().Count())
            yield return new ValidationResult("Additional recipient IDs must not contain duplicates.",
                [nameof(AdditionalRecipientIds)]);
    }
}

public abstract class RequiredReviewCommentRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxReviewCommentLength)]
    public required string Comment { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }

    [MaxLength(ContractLimits.MaxAdditionalNotificationRecipients)]
    public IReadOnlyList<Guid> AdditionalRecipientIds { get; init; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        OptionalReviewCommentRequest.ValidateAdditionalRecipients(AdditionalRecipientIds);
}

public sealed class SubmitForReviewRequest : OptionalReviewCommentRequest;
public sealed class StartReviewRequest : OptionalReviewCommentRequest;
public sealed class RequestChangesRequest : RequiredReviewCommentRequest;
public sealed class ApproveArticleRequest : OptionalReviewCommentRequest;
public sealed class RejectArticleRequest : RequiredReviewCommentRequest;
public sealed class PublishArticleRequest : OptionalReviewCommentRequest;

public sealed class WorkflowOverrideRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(50)]
    public required string TargetStatus { get; init; }

    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxReviewCommentLength)]
    public required string Reason { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }

    [MaxLength(ContractLimits.MaxAdditionalNotificationRecipients)]
    public IReadOnlyList<Guid> AdditionalRecipientIds { get; init; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        OptionalReviewCommentRequest.ValidateAdditionalRecipients(AdditionalRecipientIds);
}

public sealed class ArchiveArticleRequest : IValidatableObject
{
    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }

    [MaxLength(ContractLimits.MaxAdditionalNotificationRecipients)]
    public IReadOnlyList<Guid> AdditionalRecipientIds { get; init; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        OptionalReviewCommentRequest.ValidateAdditionalRecipients(AdditionalRecipientIds);
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
