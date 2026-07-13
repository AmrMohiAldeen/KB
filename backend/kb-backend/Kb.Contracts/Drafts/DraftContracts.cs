using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Drafts;

public sealed record ArticleDraftResponse(
    Guid DraftId,
    Guid ArticleId,
    JsonElement Content,
    string? ContentHash,
    long ContentSizeBytes,
    string RowVersion,
    string Status,
    DraftLockStatusResponse Lock,
    UserSummaryResponse CreatedBy,
    UserSummaryResponse? UpdatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed class SaveArticleDraftRequest
{
    [TiptapDocument]
    public JsonElement Content { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed record SaveArticleDraftResponse(
    Guid DraftId,
    string? ContentHash,
    long ContentSizeBytes,
    string RowVersion,
    DateTime UpdatedAt);

public sealed record DraftLockStatusResponse(
    bool IsLocked,
    UserSummaryResponse? LockedBy,
    DateTime? LockedAt);
