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
    bool CanEdit,
    bool IsLockOwner,
    UserSummaryResponse CreatedBy,
    UserSummaryResponse? UpdatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed class SaveArticleDraftRequest
{
    [TiptapDocumentRoot]
    public JsonElement Content { get; init; }

    public string? RenderedHtml { get; init; }

    public string? PlainText { get; init; }

    [Required, Base64RowVersion]
    public required string RowVersion { get; init; }
}

public sealed class DraftConcurrencyRequest
{
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

public sealed record DraftLockMutationResponse(
    string RowVersion,
    DraftLockStatusResponse Lock,
    bool CanEdit,
    bool IsLockOwner,
    DateTime UpdatedAt);
