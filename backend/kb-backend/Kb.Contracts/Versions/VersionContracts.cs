using System.Text.Json;
using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Versions;

public sealed class RestoreArticleVersionRequest
{
    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed record ArticleVersionSummaryResponse(
    Guid VersionId,
    Guid ArticleId,
    int VersionNumber,
    string? ContentHash,
    long ContentSizeBytes,
    Guid? SourceDraftId,
    int? SourceDraftNumber,
    string SnapshotReason,
    bool IsPublished,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    UserSummaryResponse? PublishedBy,
    DateTime? PublishedAt);

public sealed record ArticleVersionDetailsResponse(
    Guid VersionId,
    Guid ArticleId,
    int VersionNumber,
    string PlainText,
    string? RenderedHtml,
    string? ContentHash,
    long ContentSizeBytes,
    Guid? SourceDraftId,
    int? SourceDraftNumber,
    string SnapshotReason,
    bool IsPublished,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    UserSummaryResponse? PublishedBy,
    DateTime? PublishedAt);

public sealed record PublishedArticleVersionResponse(
    Guid VersionId,
    Guid ArticleId,
    int VersionNumber,
    JsonElement Content,
    string? ContentHash,
    long ContentSizeBytes,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    UserSummaryResponse? PublishedBy,
    DateTime? PublishedAt);

public sealed record VersionDiffSegmentResponse(string ChangeType, string Text);

public sealed record VersionDiffEntryResponse(
    string ChangeType,
    string BlockType,
    string BlockLabel,
    int? BeforePosition,
    int? AfterPosition,
    string? BeforeText,
    string? AfterText,
    IReadOnlyList<VersionDiffSegmentResponse> Segments);

public sealed record ArticleVersionComparisonResponse(
    ArticleVersionSummaryResponse BaseVersion,
    ArticleVersionSummaryResponse TargetVersion,
    JsonElement BaseContent,
    JsonElement TargetContent,
    IReadOnlyList<VersionDiffEntryResponse> Changes,
    int AddedCount,
    int RemovedCount,
    int ChangedCount,
    int UnchangedCount);
