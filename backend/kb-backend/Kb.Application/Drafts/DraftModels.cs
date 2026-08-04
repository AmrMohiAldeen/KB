using System.Text.Json;

namespace Kb.Application.Drafts;

public sealed record DraftUserData(Guid Id, string Name);

public sealed record CurrentDraftData(
    Guid DraftId,
    Guid ArticleId,
    Guid ArticleOwnerId,
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string? ContentHash,
    long ContentSizeBytes,
    byte[] RowVersion,
    string Status,
    bool IsLocked,
    DraftUserData? LockedBy,
    DateTime? LockedAt,
    DraftUserData CreatedBy,
    DraftUserData? UpdatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record DraftViewData(
    CurrentDraftData Draft,
    JsonElement Content,
    bool CanEdit,
    bool IsLockOwner);

public sealed record DraftLockData(
    CurrentDraftData Draft,
    bool CanEdit,
    bool IsLockOwner);

public sealed record SaveDraftContentCommand(
    JsonElement Content,
    string? RenderedHtml,
    string? PlainText,
    byte[] RowVersion);

public sealed record StagedDraftContent(
    string ContentJsonPath,
    string? RenderedHtmlPath,
    string? PlainTextPath,
    string ContentHash,
    long ContentSizeBytes);

public sealed record DraftAuditData(
    Guid ActorId,
    string Action,
    string MetadataJson,
    DateTime CreatedAt);
