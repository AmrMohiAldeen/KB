using Kb.Contracts.Common;

namespace Kb.Contracts.Media;

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
