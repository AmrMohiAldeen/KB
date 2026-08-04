using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.ContentBlocks.ReusableBlocks;

public abstract class ReusableBlockWriteRequest
{
    [Required, NonWhiteSpace, StringLength(200)]
    public required string Name { get; init; }

    [NonWhiteSpace, StringLength(1000)]
    public string? Description { get; init; }

    [TiptapDocument]
    public JsonElement Content { get; init; }
}

public sealed class CreateReusableBlockRequest : ReusableBlockWriteRequest;
public sealed class UpdateReusableBlockRequest : ReusableBlockWriteRequest;

public sealed record ReusableBlockSummaryResponse(
    Guid ReusableBlockId,
    string Name,
    string? Description,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record ReusableBlockDetailsResponse(
    Guid ReusableBlockId,
    string Name,
    string? Description,
    JsonElement Content,
    UserSummaryResponse CreatedBy,
    UserSummaryResponse? UpdatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);
