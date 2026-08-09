namespace Kb.Application.Media;

public enum MediaKind
{
    Image,
    Gif,
    Video,
    Pdf,
    Document
}

public sealed record MediaUserData(Guid Id, string Name);

public sealed record MediaFileData(
    Guid Id,
    string OriginalFileName,
    string StoredFileName,
    string MimeType,
    string? FileExtension,
    long FileSizeBytes,
    string StoragePath,
    string Status,
    MediaUserData UploadedBy,
    DateTime UploadedAt,
    int ReferenceCount);

public sealed record PagedMediaData(
    IReadOnlyList<MediaFileData> Items,
    int Page,
    int PageSize,
    long TotalCount);

public sealed record MediaListQuery(
    string? Search,
    MediaKind? Kind,
    string? Status,
    int Page,
    int PageSize);

public sealed record MediaUploadCommand(
    string OriginalFileName,
    string? ClientContentType,
    long FileSizeBytes,
    Stream Content);

public sealed record NewMediaData(
    Guid Id,
    string OriginalFileName,
    string StoredFileName,
    string MimeType,
    string FileExtension,
    long FileSizeBytes,
    string StoragePath,
    Guid UploadedBy,
    DateTime UploadedAt);

public sealed record ReplacementMediaData(
    string OriginalFileName,
    string StoredFileName,
    string MimeType,
    string FileExtension,
    long FileSizeBytes,
    string StoragePath,
    Guid UploadedBy,
    DateTime UploadedAt);

public sealed record MediaContentData(
    Stream Content,
    string ContentType,
    string DownloadFileName);

public sealed record MediaReferenceData(
    Guid Id,
    Guid MediaId,
    Guid? ArticleId,
    string EntityType,
    Guid EntityId);

public sealed record MediaReferenceDetailsData(
    Guid Id,
    Guid MediaId,
    Guid? ArticleId,
    string? ArticleTitle,
    string? ArticleSlug,
    string? ArticleStatus,
    string EntityType,
    Guid EntityId,
    int? VersionNumber);

public sealed record CreateMediaReferenceCommand(
    Guid? ArticleId,
    string EntityType,
    Guid EntityId);

public sealed record MediaReferenceTargetData(
    string EntityType,
    Guid EntityId,
    Guid? ArticleId,
    Guid? ArticleOwnerId);

public sealed record MediaAuditData(
    Guid ActorId,
    string Action,
    string MetadataJson,
    DateTime CreatedAt,
    Guid? ArticleId = null);
