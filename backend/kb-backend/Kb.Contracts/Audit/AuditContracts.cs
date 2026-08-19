using System.Text.Json;
using Kb.Contracts.Common;

namespace Kb.Contracts.Audit;

public sealed record AuditArticleSummaryResponse(Guid ArticleId, string Title, string Slug);
public sealed record ExternalViewerAuditActorResponse(string ExternalUserId, string? ExternalEmail,
    Guid? CustomerId, Guid? SessionId, Guid? SolutionId);

public sealed record ArticleAuditLogResponse(
    Guid AuditLogId,
    Guid? ArticleId,
    AuditArticleSummaryResponse? Article,
    UserSummaryResponse? Actor,
    ExternalViewerAuditActorResponse? ExternalActor,
    string ActionType,
    string? EntityType,
    Guid? EntityId,
    JsonElement? Metadata,
    DateTime CreatedAt);
