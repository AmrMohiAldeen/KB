using Kb.Application.Audit;
using Kb.Application.Authorization;
using Kb.Contracts.Audit;
using Kb.Contracts.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/audit-logs")]
public sealed class AuditLogsController(AuditLogService auditLogs) : ControllerBase
{
    private const string ViewPolicy = PermissionPolicy.Prefix + PermissionCodes.AuditLogsView;

    [HttpGet]
    [Authorize(Policy = ViewPolicy)]
    [ProducesResponseType<PagedResponse<ArticleAuditLogResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResponse<ArticleAuditLogResponse>>> GetList(
        [FromQuery] Guid? articleId,
        [FromQuery] Guid? userId,
        [FromQuery] string? article,
        [FromQuery] string? user,
        [FromQuery] string? actionType,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = AuditLogService.DefaultPageSize,
        [FromQuery] string? sortDirection = "desc",
        CancellationToken cancellationToken = default)
    {
        var result = await auditLogs.GetPagedAsync(
            articleId, userId, article, user, actionType, from, to,
            page, pageSize, sortDirection, cancellationToken);
        return Ok(new PagedResponse<ArticleAuditLogResponse>(
            result.Items.Select(ToResponse).ToArray(),
            result.Page,
            result.PageSize,
            result.TotalCount));
    }

    private static ArticleAuditLogResponse ToResponse(AuditLogData log) => new(
        log.Id,
        log.ArticleId,
        log.Article is null
            ? null
            : new AuditArticleSummaryResponse(log.Article.Id, log.Article.Title, log.Article.Slug),
        log.Actor is null
            ? null
            : new UserSummaryResponse(log.Actor.Id, log.Actor.Name),
        log.ActionType,
        log.EntityType,
        log.EntityId,
        log.Metadata,
        log.CreatedAt);
}
