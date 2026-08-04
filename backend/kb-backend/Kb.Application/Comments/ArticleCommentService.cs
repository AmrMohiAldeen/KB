using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Application.Notifications;

namespace Kb.Application.Comments;

public sealed class ArticleCommentService(
    IArticleCommentRepository repository,
    ICurrentUser currentUser,
    IPermissionChecker permissionChecker,
    TimeProvider timeProvider,
    NotificationService? notificationService = null)
{
    public async Task<ArticleCommentListData> ListAsync(Guid articleId, CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        await RequireArticleAsync(articleId, cancellationToken);
        var permissions = await GetPermissionsAsync(actorId, cancellationToken);
        return new(await repository.ListAsync(articleId, cancellationToken),
            permissions.CanComment, permissions.CanModerate, actorId);
    }

    public async Task<ArticleCommentData> CreateAsync(
        Guid articleId,
        CreateArticleCommentCommand command,
        CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        await RequireCommentPermissionAsync(actorId, cancellationToken);
        var article = await RequireArticleAsync(articleId, cancellationToken);
        var body = NormalizeBody(command.Body);
        ValidateAnchor(article, command.CurrentDraftId, command.AnchorType, command.AnchorData);
        var anchorJson = command.AnchorData?.GetRawText();
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var created = await repository.InsertAsync(new(
                articleId, null, body, command.CurrentDraftId, command.CurrentDraftId,
                command.AnchorType, anchorJson, CommentAnchorStatuses.Attached, CommentThreadStatuses.Open,
                actorId, now),
            Audit(actorId, ArticleAuditActions.CommentCreated, articleId, null,
                new { command.CurrentDraftId, command.AnchorType }, now), cancellationToken);
        if (notificationService is not null)
            await notificationService.NotifyCommentAsync(articleId, created.CommentId, actorId, false,
                cancellationToken);
        return created;
    }

    public async Task<ArticleCommentData> ReplyAsync(
        Guid articleId,
        Guid threadId,
        string body,
        CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        await RequireCommentPermissionAsync(actorId, cancellationToken);
        await RequireArticleAsync(articleId, cancellationToken);
        var thread = await RequireCommentAsync(articleId, threadId, cancellationToken);
        if (thread.ParentCommentId is not null)
            throw new BusinessRuleException("Replies must be added to the root comment thread.");
        if (thread.DeletedAt is not null)
            throw new ConflictException("A deleted comment thread cannot receive replies.");
        if (thread.Status == CommentThreadStatuses.Resolved)
            throw new ConflictException("A resolved comment thread must be reopened before replying.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var created = await repository.InsertAsync(new(
                articleId, threadId, NormalizeBody(body), null, null, null, null,
                CommentAnchorStatuses.Attached, CommentThreadStatuses.Open, actorId, now),
            Audit(actorId, ArticleAuditActions.CommentReplied, articleId, null,
                new { threadId }, now), cancellationToken);
        if (notificationService is not null)
            await notificationService.NotifyCommentAsync(articleId, created.CommentId, actorId, true,
                cancellationToken);
        return created;
    }

    public async Task<ArticleCommentData> UpdateAsync(
        Guid articleId,
        Guid commentId,
        string body,
        byte[] rowVersion,
        CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        var existing = await RequireCommentAsync(articleId, commentId, cancellationToken);
        await RequireOwnershipOrModerationAsync(existing, actorId, cancellationToken);
        await EnsureThreadOpenAsync(articleId, existing, cancellationToken);
        EnsureMutable(existing, rowVersion);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return await repository.UpdateBodyAsync(articleId, commentId, NormalizeBody(body), rowVersion, now,
            Audit(actorId, ArticleAuditActions.CommentUpdated, articleId, commentId,
                new { moderated = existing.CreatedBy.Id != actorId }, now), cancellationToken);
    }

    public async Task DeleteAsync(
        Guid articleId,
        Guid commentId,
        byte[] rowVersion,
        CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        var existing = await RequireCommentAsync(articleId, commentId, cancellationToken);
        await RequireOwnershipOrModerationAsync(existing, actorId, cancellationToken);
        await EnsureThreadOpenAsync(articleId, existing, cancellationToken);
        EnsureMutable(existing, rowVersion);
        if (existing.ParentCommentId is null &&
            (await repository.ListAsync(articleId, cancellationToken)).Any(comment =>
                comment.ParentCommentId == existing.CommentId && comment.DeletedAt is null))
            throw new ConflictException("A thread with replies cannot be deleted. Resolve it instead.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        await repository.SoftDeleteAsync(articleId, commentId, rowVersion, now,
            Audit(actorId, ArticleAuditActions.CommentDeleted, articleId, commentId,
                new { moderated = existing.CreatedBy.Id != actorId }, now), cancellationToken);
    }

    public Task<ArticleCommentData> ResolveAsync(
        Guid articleId,
        Guid threadId,
        byte[] rowVersion,
        CancellationToken cancellationToken) =>
        SetResolutionAsync(articleId, threadId, true, rowVersion, cancellationToken);

    public Task<ArticleCommentData> ReopenAsync(
        Guid articleId,
        Guid threadId,
        byte[] rowVersion,
        CancellationToken cancellationToken) =>
        SetResolutionAsync(articleId, threadId, false, rowVersion, cancellationToken);

    public async Task RemapAnchorsAsync(
        Guid articleId,
        Guid draftId,
        JsonElement newDocument,
        CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        var sources = await repository.ListAttachedAnchorsAsync(articleId, draftId, cancellationToken);
        if (sources.Count == 0) return;
        var updates = sources.Select(source => CommentAnchorMapper.Remap(source, draftId, newDocument)).ToArray();
        await repository.ApplyAnchorUpdatesAsync(articleId, actorId, updates,
            timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
    }

    public Task<bool> HasUnresolvedDraftDependenciesAsync(Guid draftId, CancellationToken cancellationToken) =>
        repository.HasUnresolvedDraftDependenciesAsync(draftId, cancellationToken);

    private async Task<ArticleCommentData> SetResolutionAsync(
        Guid articleId,
        Guid threadId,
        bool resolved,
        byte[] rowVersion,
        CancellationToken cancellationToken)
    {
        var actorId = RequireUser();
        var thread = await RequireCommentAsync(articleId, threadId, cancellationToken);
        if (thread.ParentCommentId is not null)
            throw new BusinessRuleException("Only root comment threads can be resolved or reopened.");
        await RequireOwnershipOrModerationAsync(thread, actorId, cancellationToken);
        EnsureVersion(thread, rowVersion);
        if (thread.DeletedAt is not null)
            throw new ConflictException("A deleted comment thread cannot be changed.");
        var expectedStatus = resolved ? CommentThreadStatuses.Open : CommentThreadStatuses.Resolved;
        if (thread.Status != expectedStatus)
            throw new ConflictException(resolved
                ? "The comment thread is already resolved."
                : "The comment thread is already open.");
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var action = resolved ? ArticleAuditActions.CommentResolved : ArticleAuditActions.CommentReopened;
        return await repository.SetResolvedAsync(articleId, threadId, resolved, actorId, rowVersion, now,
            Audit(actorId, action, articleId, threadId, new { }, now), cancellationToken);
    }

    private async Task<ArticleCommentContextData> RequireArticleAsync(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        if (articleId == Guid.Empty) throw new BusinessRuleException("Article ID is required.");
        return await repository.GetArticleContextAsync(articleId, cancellationToken)
               ?? throw new NotFoundException("The article was not found.");
    }

    private async Task<ArticleCommentData> RequireCommentAsync(
        Guid articleId,
        Guid commentId,
        CancellationToken cancellationToken)
    {
        if (commentId == Guid.Empty) throw new BusinessRuleException("Comment ID is required.");
        await RequireArticleAsync(articleId, cancellationToken);
        return await repository.GetAsync(articleId, commentId, cancellationToken)
               ?? throw new NotFoundException("The comment was not found.");
    }

    private async Task RequireCommentPermissionAsync(Guid actorId, CancellationToken cancellationToken)
    {
        if (!await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.CommentsCreate, cancellationToken))
            throw new ForbiddenException("You do not have permission to create comments.");
    }

    private async Task RequireOwnershipOrModerationAsync(
        ArticleCommentData comment,
        Guid actorId,
        CancellationToken cancellationToken)
    {
        if (comment.CreatedBy.Id == actorId)
        {
            await RequireCommentPermissionAsync(actorId, cancellationToken);
            return;
        }
        if (!await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.CommentsModerate, cancellationToken))
            throw new ForbiddenException("You cannot modify another user's comment.");
    }

    private async Task<(bool CanComment, bool CanModerate)> GetPermissionsAsync(
        Guid actorId,
        CancellationToken cancellationToken)
    {
        var canComment = await permissionChecker.HasPermissionAsync(
            actorId, PermissionCodes.CommentsCreate, cancellationToken);
        var canModerate = await permissionChecker.HasPermissionAsync(
            actorId, PermissionCodes.CommentsModerate, cancellationToken);
        return (canComment, canModerate);
    }

    private static void ValidateAnchor(
        ArticleCommentContextData article,
        Guid? draftId,
        string? anchorType,
        JsonElement? anchorData)
    {
        if (anchorType is null)
        {
            if (anchorData is not null)
                throw new BusinessRuleException("Article-level comments cannot contain anchor data.");
            if (draftId is not null && draftId != article.CurrentDraftId)
                throw new ConflictException("The selected draft is no longer current.");
            return;
        }
        if (draftId is null || draftId != article.CurrentDraftId)
            throw new ConflictException("Anchored comments must target the current article draft.");
        if (anchorData is not { ValueKind: JsonValueKind.Object })
            throw new BusinessRuleException("Anchored comments require anchor data.");

        if (anchorType == "TextRange")
        {
            if (!TryPositiveInt(anchorData.Value, "from", out var from) ||
                !TryPositiveInt(anchorData.Value, "to", out var to) || to <= from ||
                !anchorData.Value.TryGetProperty("selectedText", out var selected) ||
                selected.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(selected.GetString()))
                throw new BusinessRuleException("Text-range anchors require valid from/to positions and selectedText.");
            return;
        }
        if (anchorType == "Block")
        {
            if (!TryNonNegativeInt(anchorData.Value, "position", out _) ||
                !anchorData.Value.TryGetProperty("nodeType", out var nodeType) ||
                nodeType.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(nodeType.GetString()))
                throw new BusinessRuleException("Block anchors require a position and nodeType.");
            return;
        }
        throw new BusinessRuleException("Unsupported comment anchor type.");
    }

    private static bool TryPositiveInt(JsonElement value, string name, out int result)
    {
        result = 0;
        return value.TryGetProperty(name, out var item) && item.TryGetInt32(out result) && result > 0;
    }

    private static bool TryNonNegativeInt(JsonElement value, string name, out int result)
    {
        result = -1;
        return value.TryGetProperty(name, out var item) && item.TryGetInt32(out result) && result >= 0;
    }

    private static string NormalizeBody(string body)
    {
        var value = body?.Trim();
        if (string.IsNullOrWhiteSpace(value))
            throw new BusinessRuleException("Comment body is required.");
        if (value.Length > 20_000)
            throw new BusinessRuleException("Comment body cannot exceed 20000 characters.");
        return value;
    }

    private static void EnsureMutable(ArticleCommentData comment, byte[] rowVersion)
    {
        EnsureVersion(comment, rowVersion);
        if (comment.DeletedAt is not null) throw new ConflictException("The comment has been deleted.");
        if (comment.Status == CommentThreadStatuses.Resolved)
            throw new ConflictException("Comments in a resolved thread cannot be edited.");
    }

    private async Task EnsureThreadOpenAsync(
        Guid articleId,
        ArticleCommentData comment,
        CancellationToken cancellationToken)
    {
        if (comment.ParentCommentId is not { } threadId) return;
        var thread = await RequireCommentAsync(articleId, threadId, cancellationToken);
        if (thread.Status == CommentThreadStatuses.Resolved)
            throw new ConflictException("Comments in a resolved thread cannot be edited.");
    }

    private static void EnsureVersion(ArticleCommentData comment, byte[] rowVersion)
    {
        if (rowVersion.Length == 0 || !comment.RowVersion.AsSpan().SequenceEqual(rowVersion))
            throw new ConcurrencyConflictException();
    }

    private Guid RequireUser()
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        return currentUser.UserId;
    }

    private static CommentAuditData Audit(
        Guid actorId,
        string action,
        Guid articleId,
        Guid? commentId,
        object metadata,
        DateTime createdAt) =>
        new(actorId, action, JsonSerializer.Serialize(new { articleId, commentId, metadata }), createdAt);
}
