using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;

namespace Kb.Application.Notifications;

public sealed class NotificationService(
    INotificationRepository repository,
    ICurrentUser currentUser,
    TimeProvider timeProvider)
{
    public const int DefaultPageSize = 25;
    public const int MaxPageSize = 100;

    public Task<PagedNotificationData> ListAsync(int page, int pageSize, CancellationToken cancellationToken)
    {
        var userId = RequireUser();
        ValidatePaging(page, pageSize);
        return repository.ListAsync(userId, page, pageSize, cancellationToken);
    }

    public Task<long> GetUnreadCountAsync(CancellationToken cancellationToken) =>
        repository.GetUnreadCountAsync(RequireUser(), cancellationToken);

    public async Task<NotificationData> MarkReadAsync(Guid notificationId,
        CancellationToken cancellationToken)
    {
        if (notificationId == Guid.Empty)
            throw new BusinessRuleException("Notification ID is required.");
        return await repository.MarkReadAsync(notificationId, RequireUser(), UtcNow(), cancellationToken)
            ?? throw new NotFoundException("The notification was not found.");
    }

    public Task<MarkAllNotificationsReadData> MarkAllReadAsync(CancellationToken cancellationToken) =>
        repository.MarkAllReadAsync(RequireUser(), UtcNow(), cancellationToken);

    public async Task<bool> GetArticlePreferenceAsync(Guid articleId, CancellationToken cancellationToken)
    {
        if (articleId == Guid.Empty) throw new BusinessRuleException("Article ID is required.");
        if (await repository.GetArticleContextAsync(articleId, cancellationToken) is null)
            throw new NotFoundException("The article was not found.");
        return await repository.GetArticlePreferenceAsync(articleId, RequireUser(), cancellationToken) ?? true;
    }

    public async Task<bool> SetArticlePreferenceAsync(Guid articleId, bool enabled,
        CancellationToken cancellationToken)
    {
        if (articleId == Guid.Empty) throw new BusinessRuleException("Article ID is required.");
        if (!await repository.SetArticlePreferenceAsync(articleId, RequireUser(), enabled, UtcNow(), cancellationToken))
            throw new NotFoundException("The article was not found.");
        return enabled;
    }

    public async Task NotifyWorkflowAsync(Guid articleId, string type, Guid actorId, string? detail,
        CancellationToken cancellationToken)
    {
        var article = await repository.GetArticleContextAsync(articleId, cancellationToken);
        if (article is null) return;

        IReadOnlyCollection<Guid> recipients = type switch
        {
            NotificationTypes.ArticleSubmittedForReview =>
                await repository.GetActiveUserIdsWithPermissionAsync(PermissionCodes.ArticlesReview,
                    cancellationToken),
            NotificationTypes.ArticlePublished =>
                (await repository.GetArticleParticipantUserIdsAsync(articleId, cancellationToken))
                    .Append(article.AuthorId).Distinct().ToArray(),
            NotificationTypes.ArticleApproved or NotificationTypes.ArticleRejected or
                NotificationTypes.ArticleChangesRequested => [article.AuthorId],
            _ => []
        };

        var (title, message) = WorkflowCopy(type, article.Title, detail);
        await InsertForRecipientsAsync(articleId, type, title, message, recipients, actorId, cancellationToken);
    }

    public async Task NotifyCommentAsync(Guid articleId, Guid commentId, Guid actorId, bool isReply,
        CancellationToken cancellationToken)
    {
        var article = await repository.GetArticleContextAsync(articleId, cancellationToken);
        if (article is null) return;
        var recipients = isReply
            ? await repository.GetCommentThreadParticipantUserIdsAsync(articleId, commentId, cancellationToken)
            : [];
        await InsertForRecipientsAsync(articleId, NotificationTypes.ArticleCommented,
            isReply ? "New reply on your article" : "New comment on your article",
            isReply
                ? $"A new reply was added to a comment thread on “{article.Title}”."
                : $"A new comment was added to “{article.Title}”.",
            recipients.Append(article.AuthorId).Distinct(), actorId, cancellationToken);
    }

    public async Task NotifyLockChangedAsync(Guid articleId, string type, Guid actorId, Guid? previousOwnerId,
        CancellationToken cancellationToken)
    {
        var article = await repository.GetArticleContextAsync(articleId, cancellationToken);
        if (article is null) return;
        var title = type switch
        {
            NotificationTypes.ArticleLockAcquired => "Article draft locked",
            NotificationTypes.ArticleLockForceReleased => "Article lock force-released",
            _ => "Article draft unlocked"
        };
        var verb = type switch
        {
            NotificationTypes.ArticleLockAcquired => "locked for editing",
            NotificationTypes.ArticleLockForceReleased => "force-unlocked",
            _ => "unlocked"
        };
        await InsertForRecipientsAsync(articleId, type, title, $"“{article.Title}” was {verb}.",
            new[] { article.AuthorId, previousOwnerId }.OfType<Guid>().Distinct(), actorId, cancellationToken);
    }

    private async Task InsertForRecipientsAsync(Guid articleId, string type, string title, string message,
        IEnumerable<Guid> recipientIds, Guid actorId, CancellationToken cancellationToken)
    {
        var now = UtcNow();
        var recipientArray = recipientIds.Where(id => id != Guid.Empty && id != actorId).Distinct().ToArray();
        var disabled = await repository.GetDisabledRecipientIdsAsync(articleId, recipientArray, cancellationToken);
        var notifications = recipientArray.Where(id => !disabled.Contains(id))
            .Select(userId => new NewNotificationData(Guid.NewGuid(), userId, articleId, type, title, message, now))
            .ToArray();
        if (notifications.Length > 0)
            await repository.InsertAsync(notifications, cancellationToken);
    }

    private static (string Title, string Message) WorkflowCopy(string type, string articleTitle, string? detail)
    {
        var suffix = string.IsNullOrWhiteSpace(detail) ? string.Empty : $" {detail.Trim()}";
        return type switch
        {
            NotificationTypes.ArticleSubmittedForReview =>
                ("Article ready for review", $"“{articleTitle}” was submitted for review.{suffix}"),
            NotificationTypes.ArticleApproved =>
                ("Article approved", $"“{articleTitle}” was approved.{suffix}"),
            NotificationTypes.ArticleRejected =>
                ("Article rejected", $"“{articleTitle}” was rejected.{suffix}"),
            NotificationTypes.ArticleChangesRequested =>
                ("Changes requested", $"Changes were requested for “{articleTitle}”.{suffix}"),
            NotificationTypes.ArticlePublished =>
                ("Article published", $"“{articleTitle}” was published.{suffix}"),
            _ => ("Article updated", $"“{articleTitle}” was updated.{suffix}")
        };
    }

    private Guid RequireUser()
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        return currentUser.UserId;
    }

    private DateTime UtcNow() => timeProvider.GetUtcNow().UtcDateTime;

    private static void ValidatePaging(int page, int pageSize)
    {
        if (page < 1) throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize is < 1 or > MaxPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxPageSize}.");
    }
}
