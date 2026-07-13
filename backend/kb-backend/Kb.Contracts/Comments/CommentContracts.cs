using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Comments;

public sealed class CreateCommentRequest : IValidatableObject
{
    [NonEmptyGuid]
    public Guid? ParentCommentId { get; init; }

    [Required, NonWhiteSpace, StringLength(ContractLimits.MaxCommentLength)]
    public required string Body { get; init; }

    [NonWhiteSpace, StringLength(50)]
    public string? AnchorType { get; init; }

    public JsonElement? AnchorData { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (AnchorType is null && AnchorData is not null)
            yield return new ValidationResult("AnchorData requires an AnchorType.", [nameof(AnchorData), nameof(AnchorType)]);

        if (AnchorType is not null && !CommentAnchorTypes.All.Contains(AnchorType))
            yield return new ValidationResult("AnchorType must be TextRange or Block.", [nameof(AnchorType)]);

        if (AnchorType is not null && (AnchorData is null || AnchorData.Value.ValueKind != JsonValueKind.Object))
            yield return new ValidationResult("AnchorData is required and must be a JSON object for anchored comments.", [nameof(AnchorData)]);
    }
}

public sealed record CommentResponse(
    Guid CommentId,
    Guid ArticleId,
    Guid? ParentCommentId,
    string Body,
    string? AnchorType,
    JsonElement? AnchorData,
    string Status,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    UserSummaryResponse? ResolvedBy,
    DateTime? ResolvedAt,
    IReadOnlyList<CommentResponse> Replies);
