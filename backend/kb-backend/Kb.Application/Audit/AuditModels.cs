using System.Text.Json;

namespace Kb.Application.Audit;

public sealed record AuditLogQuery(
    Guid? ArticleId,
    Guid? UserId,
    string? Article,
    string? User,
    string? ActionType,
    DateTime? From,
    DateTime? To,
    int Page,
    int PageSize,
    bool Descending);

public sealed record AuditUserData(Guid Id, string Name);
public sealed record AuditExternalActorData(string ExternalUserId, string? ExternalEmail, Guid? CustomerId,
    Guid? SessionId, Guid? SolutionId);

public sealed record AuditArticleData(Guid Id, string Title, string Slug);

public sealed record AuditLogRecordData(
    Guid Id,
    Guid? ArticleId,
    AuditArticleData? Article,
    AuditUserData? Actor,
    AuditExternalActorData? ExternalActor,
    string ActionType,
    string? EntityType,
    Guid? EntityId,
    string? MetadataJson,
    DateTime CreatedAt);

public sealed record AuditLogData(
    Guid Id,
    Guid? ArticleId,
    AuditArticleData? Article,
    AuditUserData? Actor,
    AuditExternalActorData? ExternalActor,
    string ActionType,
    string? EntityType,
    Guid? EntityId,
    JsonElement? Metadata,
    DateTime CreatedAt);

public sealed record PagedAuditLogRecordData(
    IReadOnlyList<AuditLogRecordData> Items,
    int Page,
    int PageSize,
    long TotalCount);

public sealed record PagedAuditLogData(
    IReadOnlyList<AuditLogData> Items,
    int Page,
    int PageSize,
    long TotalCount);
