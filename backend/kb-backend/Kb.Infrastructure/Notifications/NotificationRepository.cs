using Kb.Application.Notifications;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Notifications;

public sealed class NotificationRepository(KbDbContext dbContext) : INotificationRepository
{
    public async Task<PagedNotificationData> ListAsync(Guid userId, int page, int pageSize,
        CancellationToken cancellationToken)
    {
        var source = dbContext.Notifications.AsNoTracking().Where(value => value.UserIdFk == userId);
        var total = await source.LongCountAsync(cancellationToken);
        var items = await source.OrderByDescending(value => value.CreatedAt)
            .ThenByDescending(value => value.NotificationId)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(value => Map(value)).ToArrayAsync(cancellationToken);
        return new(items, page, pageSize, total);
    }

    public Task<long> GetUnreadCountAsync(Guid userId, CancellationToken cancellationToken) =>
        dbContext.Notifications.AsNoTracking()
            .LongCountAsync(value => value.UserIdFk == userId && !value.IsRead, cancellationToken);

    public async Task<NotificationData?> MarkReadAsync(Guid notificationId, Guid userId, DateTime readAt,
        CancellationToken cancellationToken)
    {
        var notification = await dbContext.Notifications.SingleOrDefaultAsync(value =>
            value.NotificationId == notificationId && value.UserIdFk == userId, cancellationToken);
        if (notification is null) return null;
        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = readAt;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        return Map(notification);
    }

    public async Task<MarkAllNotificationsReadData> MarkAllReadAsync(Guid userId, DateTime readAt,
        CancellationToken cancellationToken)
    {
        var unread = await dbContext.Notifications
            .Where(value => value.UserIdFk == userId && !value.IsRead).ToArrayAsync(cancellationToken);
        foreach (var notification in unread)
        {
            notification.IsRead = true;
            notification.ReadAt = readAt;
        }
        if (unread.Length > 0) await dbContext.SaveChangesAsync(cancellationToken);
        return new(unread.Length, 0);
    }

    public Task<ArticleNotificationContextData?> GetArticleContextAsync(Guid articleId,
        CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking().Where(article => article.ArticleId == articleId)
            .Select(article => new ArticleNotificationContextData(article.Title, article.AuthorIdFk))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> GetActiveUserIdsWithPermissionAsync(string permission,
        CancellationToken cancellationToken) =>
        await (from user in dbContext.Users.AsNoTracking()
               join userRole in dbContext.UserRoles.AsNoTracking() on user.UserId equals userRole.UserId
               join rolePermission in dbContext.RolePermissions.AsNoTracking()
                   on userRole.RoleId equals rolePermission.RoleIdFk
               where user.IsActive && rolePermission.PermissionCode == permission
               select user.UserId).Distinct().ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> GetArticleParticipantUserIdsAsync(Guid articleId,
        CancellationToken cancellationToken)
    {
        var reviewers = dbContext.ArticleReviewEvents.AsNoTracking()
            .Where(value => value.ArticleIdFk == articleId).Select(value => value.ActorIdFk);
        var commenters = dbContext.ArticleComments.AsNoTracking()
            .Where(value => value.ArticleIdFk == articleId && value.DeletedAt == null)
            .Select(value => value.CreatedByFk);
        return await reviewers.Concat(commenters).Distinct().ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Guid>> GetCommentThreadParticipantUserIdsAsync(Guid articleId,
        Guid commentId, CancellationToken cancellationToken)
    {
        var comment = await dbContext.ArticleComments.AsNoTracking().Where(value =>
                value.ArticleIdFk == articleId && value.CommentId == commentId)
            .Select(value => new { value.CommentId, value.ParentCommentIdFk })
            .SingleOrDefaultAsync(cancellationToken);
        if (comment is null) return [];
        var rootId = comment.ParentCommentIdFk ?? comment.CommentId;
        return await dbContext.ArticleComments.AsNoTracking().Where(value =>
                value.ArticleIdFk == articleId && value.DeletedAt == null &&
                (value.CommentId == rootId || value.ParentCommentIdFk == rootId))
            .Select(value => value.CreatedByFk).Distinct().ToArrayAsync(cancellationToken);
    }

    public async Task InsertAsync(IReadOnlyCollection<NewNotificationData> notifications,
        CancellationToken cancellationToken)
    {
        dbContext.Notifications.AddRange(notifications.Select(value => new Notification
        {
            NotificationId = value.NotificationId,
            UserIdFk = value.UserId,
            ArticleIdFk = value.ArticleId,
            Type = value.Type,
            Title = value.Title,
            Body = value.Message,
            IsRead = false,
            CreatedAt = value.CreatedAt
        }));
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static NotificationData Map(Notification value) => new(
        value.NotificationId, value.UserIdFk, value.ArticleIdFk, value.Type, value.Title,
        value.Body ?? string.Empty, value.IsRead, value.CreatedAt, value.ReadAt);
}
