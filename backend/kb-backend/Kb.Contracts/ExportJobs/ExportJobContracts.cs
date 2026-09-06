using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.ExportJobs;

public sealed class CreateExportRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(30)]
    public required string ExportType { get; init; }

    [StringLength(35)]
    public string? LocaleCode { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(ExportType) && !ExportTypes.All.Contains(ExportType))
            yield return new ValidationResult("ExportType must be PDF or HTML.", [nameof(ExportType)]);
    }
}

public sealed class ExportArticleRequest : IValidatableObject
{
    [Required, NonWhiteSpace, StringLength(30)]
    public required string SourceType { get; init; }

    public Guid? DraftId { get; init; }

    public Guid? VersionId { get; init; }

    [Required, NonWhiteSpace, StringLength(30)]
    public required string ExportType { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(ExportType) && !ExportTypes.All.Contains(ExportType))
            yield return new ValidationResult("ExportType must be PDF or HTML.", [nameof(ExportType)]);
        if (!string.IsNullOrWhiteSpace(SourceType) && !ExportSourceTypes.All.Contains(SourceType))
            yield return new ValidationResult("SourceType must be Draft or Version.", [nameof(SourceType)]);

        var isDraft = SourceType?.Equals(ExportSourceTypes.Draft, StringComparison.OrdinalIgnoreCase) == true;
        var isVersion = SourceType?.Equals(ExportSourceTypes.Version, StringComparison.OrdinalIgnoreCase) == true;
        if (isDraft && (DraftId is null || DraftId == Guid.Empty || VersionId is not null))
            yield return new ValidationResult(
                "Draft exports require one non-empty DraftId and no VersionId.",
                [nameof(DraftId), nameof(VersionId)]);
        if (isVersion && (VersionId is null || VersionId == Guid.Empty || DraftId is not null))
            yield return new ValidationResult(
                "Version exports require one non-empty VersionId and no DraftId.",
                [nameof(DraftId), nameof(VersionId)]);
    }
}

public sealed record ExportJobResponse(
    Guid ExportJobId,
    string EntityType,
    Guid? ArticleId,
    Guid? CategoryId,
    string? SourceType,
    Guid? DraftId,
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
        : this(exportJobId, "Article", articleId, null, ExportSourceTypes.Version, null, versionId,
            exportType, status, requestedBy,
            requestedAt, null, null, $"article-export.{(exportType == ExportTypes.Pdf ? "pdf" : "html")}",
            downloadUrl, errorMessage) { }
}
