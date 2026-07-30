using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Media;

public sealed record MediaListItemResponse(
    Guid MediaId,
    string OriginalFileName,
    string MimeType,
    string? FileExtension,
    long FileSizeBytes,
    string Url,
    string Status,
    UserSummaryResponse UploadedBy,
    DateTime UploadedAt,
    int ReferenceCount);

public sealed record MediaUploadResponse(
    Guid MediaId,
    string OriginalFileName,
    string MimeType,
    string? FileExtension,
    long FileSizeBytes,
    string Url,
    string Status,
    DateTime UploadedAt);

public sealed record MediaDetailsResponse(
    Guid MediaId,
    string OriginalFileName,
    string MimeType,
    string? FileExtension,
    long FileSizeBytes,
    string Url,
    string Status,
    UserSummaryResponse UploadedBy,
    DateTime UploadedAt,
    int ReferenceCount);

public sealed record MediaReferenceResponse(
    Guid ReferenceId,
    Guid MediaId,
    Guid? ArticleId,
    string ReferenceEntityType,
    Guid ReferenceEntityId);

public sealed class CreateMediaReferenceRequest
{
    public Guid? ArticleId { get; init; }

    [Required, StringLength(100)]
    public required string ReferenceEntityType { get; init; }

    public Guid ReferenceEntityId { get; init; }
}

public sealed class SynchronizeDraftMediaReferencesRequest
{
    [MaxLength(500)]
    public IReadOnlyList<Guid> MediaIds { get; init; } = [];
}
