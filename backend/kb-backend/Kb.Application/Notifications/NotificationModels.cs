namespace Kb.Application.Notifications;

public sealed record NotificationData(
    Guid NotificationId, Guid UserId, Guid? ArticleId, string Type, string Title, string Message,
    bool IsRead, DateTime CreatedAt, DateTime? ReadAt);

public sealed record PagedNotificationData(
    IReadOnlyList<NotificationData> Items, int Page, int PageSize, long TotalCount);

public sealed record ArticleNotificationContextData(string Title, Guid AuthorId);

public sealed record NotificationRecipientData(Guid UserId, string FullName, string Email);

public sealed record NewNotificationData(
    Guid NotificationId, Guid UserId, Guid ArticleId, string Type, string Title, string Message,
    DateTime CreatedAt);

public sealed record MarkAllNotificationsReadData(int MarkedReadCount, long UnreadCount);
