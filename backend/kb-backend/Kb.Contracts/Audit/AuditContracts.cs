using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Audit;

public sealed record AuditArticleSummaryResponse(Guid ArticleId, string Title, string Slug);

public sealed record ArticleAuditLogResponse(
    Guid AuditLogId,
    Guid? ArticleId,
    AuditArticleSummaryResponse? Article,
    UserSummaryResponse? Actor,
    string ActionType,
    string? EntityType,
    Guid? EntityId,
    JsonElement? Metadata,
    DateTime CreatedAt);
