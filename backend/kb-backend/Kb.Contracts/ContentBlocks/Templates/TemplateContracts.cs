using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.ContentBlocks.Templates;

public abstract class TemplateWriteRequest
{
    [Required, NonWhiteSpace, StringLength(200)]
    public required string Name { get; init; }

    [NonWhiteSpace, StringLength(1000)]
    public string? Description { get; init; }

    [TiptapDocument]
    public JsonElement Content { get; init; }
}

public sealed class CreateTemplateRequest : TemplateWriteRequest;
public sealed class UpdateTemplateRequest : TemplateWriteRequest;

public sealed record TemplateSummaryResponse(
    Guid TemplateId,
    string Name,
    string? Description,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record TemplateDetailsResponse(
    Guid TemplateId,
    string Name,
    string? Description,
    JsonElement Content,
    UserSummaryResponse CreatedBy,
    UserSummaryResponse? UpdatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);
