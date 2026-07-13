using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.ExportJobs;

public sealed class ExportArticleRequest : IValidatableObject
{
    [NonEmptyGuid]
    public Guid VersionId { get; init; }

    [Required, NonWhiteSpace, StringLength(30)]
    public required string ExportType { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(ExportType) && !ExportTypes.All.Contains(ExportType))
            yield return new ValidationResult("ExportType must be PDF or HTML.", [nameof(ExportType)]);
    }
}

public sealed record ExportJobResponse(
    Guid ExportJobId,
    Guid ArticleId,
    Guid VersionId,
    string ExportType,
    string Status,
    UserSummaryResponse RequestedBy,
    DateTime RequestedAt,
    string? DownloadUrl,
    string? ErrorMessage);
