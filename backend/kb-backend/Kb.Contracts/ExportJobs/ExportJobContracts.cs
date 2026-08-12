using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.ExportJobs;

public sealed class CreateExportRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(30)]
    public required string ExportType { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(ExportType) && !ExportTypes.All.Contains(ExportType))
            yield return new ValidationResult("ExportType must be PDF or HTML.", [nameof(ExportType)]);
    }
}

// Retained for compatibility with clients that explicitly selected an immutable version.
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
    string EntityType,
    Guid? ArticleId,
    Guid? CategoryId,
    Guid? VersionId,
    string ExportType,
    string Status,
    UserSummaryResponse RequestedBy,
    DateTime RequestedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    string FileName,
    string? DownloadUrl,
    string? ErrorMessage)
{
    public ExportJobResponse(Guid exportJobId, Guid articleId, Guid versionId, string exportType,
        string status, UserSummaryResponse requestedBy, DateTime requestedAt, string? downloadUrl,
        string? errorMessage)
        : this(exportJobId, "Article", articleId, null, versionId, exportType, status, requestedBy,
            requestedAt, null, null, $"article-export.{(exportType == ExportTypes.Pdf ? "pdf" : "html")}",
            downloadUrl, errorMessage) { }
}
