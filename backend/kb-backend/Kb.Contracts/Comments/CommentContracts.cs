using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Comments;

public sealed class CreateCommentRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxCommentLength)]
    public required string Body { get; init; }

    [NonEmptyGuid]
    public Guid? CurrentDraftId { get; init; }

    [NonWhiteSpace, StringLength(50)]
    public string? AnchorType { get; init; }

    public JsonElement? AnchorData { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) =>
        CommentAnchorValidation.Validate(AnchorType, AnchorData);
}

public sealed class ReplyToCommentRequest
{
    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxCommentLength)]
    public required string Body { get; init; }
}

public sealed class UpdateCommentRequest
{
    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxCommentLength)]
    public required string Body { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed class CommentConcurrencyRequest
{
    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed record CommentResponse(
    Guid CommentId,
    Guid ArticleId,
    Guid? ParentCommentId,
    string? Body,
    Guid? CurrentDraftId,
    Guid? OriginDraftId,
    string? AnchorType,
    JsonElement? AnchorData,
    string AnchorStatus,
    string Status,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    UserSummaryResponse? ResolvedBy,
    DateTime? ResolvedAt,
    DateTime? DeletedAt,
    string RowVersion,
    bool CanUpdate,
    bool CanDelete,
    bool CanResolve,
    IReadOnlyList<CommentResponse> Replies);

public sealed record ArticleCommentsResponse(
    IReadOnlyList<CommentResponse> Threads,
    bool CanComment,
    bool CanModerate);

internal static class CommentAnchorValidation
{
    public static IEnumerable<ValidationResult> Validate(string? anchorType, JsonElement? anchorData)
    {
        if (anchorType is null && anchorData is not null)
            yield return new ValidationResult("AnchorData requires an AnchorType.",
                [nameof(CreateCommentRequest.AnchorData), nameof(CreateCommentRequest.AnchorType)]);

        if (anchorType is not null && !CommentAnchorTypes.All.Contains(anchorType))
            yield return new ValidationResult("AnchorType must be TextRange or Block.",
                [nameof(CreateCommentRequest.AnchorType)]);

        if (anchorType is not null &&
            (anchorData is null || anchorData.Value.ValueKind != JsonValueKind.Object))
            yield return new ValidationResult(
                "AnchorData is required and must be a JSON object for anchored comments.",
                [nameof(CreateCommentRequest.AnchorData)]);
    }
}
