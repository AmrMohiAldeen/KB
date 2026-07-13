using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Versions;

public sealed record ArticleVersionSummaryResponse(
    Guid VersionId,
    Guid ArticleId,
    int VersionNumber,
    string? ContentHash,
    long ContentSizeBytes,
    UserSummaryResponse CreatedBy,
    DateTime CreatedAt,
    UserSummaryResponse? PublishedBy,
    DateTime? PublishedAt);

public sealed record ArticleVersionDetailsResponse(
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
