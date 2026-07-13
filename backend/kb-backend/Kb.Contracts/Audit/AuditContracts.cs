using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Audit;

public sealed record ArticleAuditLogResponse(
    Guid AuditLogId,
    Guid? ArticleId,
    UserSummaryResponse? Actor,
    string ActionType,
    string? EntityType,
    Guid? EntityId,
    JsonElement? Metadata,
    DateTime CreatedAt);
