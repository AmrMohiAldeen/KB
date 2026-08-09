using Kb.Application.Notifications;
using Kb.Contracts.Common;
using Kb.Contracts.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class NotificationsController(NotificationService notifications) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<NotificationResponse>>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = NotificationService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var result = await notifications.ListAsync(page, pageSize, cancellationToken);
        return Ok(new PagedResponse<NotificationResponse>(
            result.Items.Select(ToResponse).ToArray(), result.Page, result.PageSize, result.TotalCount));
    }

    [HttpGet("unread-count")]
    public async Task<ActionResult<UnreadNotificationCountResponse>> UnreadCount(
        CancellationToken cancellationToken) =>
        Ok(new UnreadNotificationCountResponse(await notifications.GetUnreadCountAsync(cancellationToken)));

    [HttpPatch("{notificationId:guid}/read")]
    public async Task<ActionResult<NotificationResponse>> MarkRead(Guid notificationId,
        CancellationToken cancellationToken) =>
        Ok(ToResponse(await notifications.MarkReadAsync(notificationId, cancellationToken)));

    [HttpPatch("read-all")]
    public async Task<ActionResult<MarkAllNotificationsReadResponse>> MarkAllRead(
        CancellationToken cancellationToken)
    {
        var result = await notifications.MarkAllReadAsync(cancellationToken);
        return Ok(new MarkAllNotificationsReadResponse(result.MarkedReadCount, result.UnreadCount));
    }

    [HttpGet("articles/{articleId:guid}/preference")]
    public async Task<ActionResult<ArticleNotificationPreferenceResponse>> GetArticlePreference(
        Guid articleId, CancellationToken cancellationToken) =>
        Ok(new ArticleNotificationPreferenceResponse(articleId,
            await notifications.GetArticlePreferenceAsync(articleId, cancellationToken)));

    [HttpPut("articles/{articleId:guid}/preference")]
    public async Task<ActionResult<ArticleNotificationPreferenceResponse>> SetArticlePreference(
        Guid articleId, UpdateArticleNotificationPreferenceRequest request, CancellationToken cancellationToken) =>
        Ok(new ArticleNotificationPreferenceResponse(articleId,
            await notifications.SetArticlePreferenceAsync(articleId, request.Enabled, cancellationToken)));

    private static NotificationResponse ToResponse(NotificationData value) => new(
        value.NotificationId, value.ArticleId, value.Type, value.Title, value.Message,
        value.IsRead, value.CreatedAt, value.ReadAt);
}
