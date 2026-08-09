namespace Kb.Application.Notifications;

public interface INotificationRepository
{
    Task<PagedNotificationData> ListAsync(Guid userId, int page, int pageSize,
        CancellationToken cancellationToken);
    Task<long> GetUnreadCountAsync(Guid userId, CancellationToken cancellationToken);
    Task<NotificationData?> MarkReadAsync(Guid notificationId, Guid userId, DateTime readAt,
        CancellationToken cancellationToken);
    Task<MarkAllNotificationsReadData> MarkAllReadAsync(Guid userId, DateTime readAt,
        CancellationToken cancellationToken);
    Task<ArticleNotificationContextData?> GetArticleContextAsync(Guid articleId,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<Guid>> GetActiveUserIdsWithPermissionAsync(string permission,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<Guid>> GetArticleParticipantUserIdsAsync(Guid articleId,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<Guid>> GetCommentThreadParticipantUserIdsAsync(Guid articleId, Guid commentId,
        CancellationToken cancellationToken);
    Task InsertAsync(IReadOnlyCollection<NewNotificationData> notifications,
        CancellationToken cancellationToken);
    Task<bool?> GetArticlePreferenceAsync(Guid articleId, Guid userId, CancellationToken cancellationToken);
    Task<bool> SetArticlePreferenceAsync(Guid articleId, Guid userId, bool enabled, DateTime updatedAt,
        CancellationToken cancellationToken);
    Task<IReadOnlySet<Guid>> GetDisabledRecipientIdsAsync(Guid articleId, IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken);
}
