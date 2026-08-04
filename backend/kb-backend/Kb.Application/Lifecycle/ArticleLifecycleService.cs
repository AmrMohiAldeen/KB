using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Articles;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Application.Workflow;
using Kb.Domain.Constants;
using Microsoft.Extensions.Options;
using Kb.Application.Notifications;

namespace Kb.Application.Lifecycle;

public sealed class ArticleLifecycleService
{
    public const int DefaultVersionPageSize = 20;
    public const int MaxVersionPageSize = 100;

    private static readonly IReadOnlySet<string> OverrideStatuses = new HashSet<string>(StringComparer.Ordinal)
    {
        ArticleStatuses.Draft,
        ArticleStatuses.SubmittedForReview,
        ArticleStatuses.InReview,
        ArticleStatuses.ChangesRequested,
        ArticleStatuses.Resubmitted,
        ArticleStatuses.Approved
    };

    private readonly IArticleLifecycleRepository repository;
    private readonly IObjectStorage storage;
    private readonly ICurrentUser currentUser;
    private readonly IPermissionChecker permissionChecker;
    private readonly IAdminChecker adminChecker;
    private readonly TimeProvider timeProvider;
    private readonly DraftContentOptions options;
    private readonly NotificationService? notificationService;

    public ArticleLifecycleService(
        IArticleLifecycleRepository repository,
        IObjectStorage storage,
        ICurrentUser currentUser,
        IPermissionChecker permissionChecker,
        IAdminChecker adminChecker,
        TimeProvider timeProvider,
        IOptions<DraftContentOptions> options,
        NotificationService? notificationService = null)
    {
        this.repository = repository;
        this.storage = storage;
        this.currentUser = currentUser;
        this.permissionChecker = permissionChecker;
        this.adminChecker = adminChecker;
        this.timeProvider = timeProvider;
        this.options = options.Value;
        this.notificationService = notificationService;
    }

    public async Task<LifecyclePermissionsData> GetPermissionsAsync(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        var draft = await GetCurrentActiveAsync(articleId, cancellationToken);
        var actorId = currentUser.UserId;
        var isAdmin = await adminChecker.IsAdminAsync(actorId, cancellationToken);
        var permissionCodes = new[]
        {
            PermissionCodes.ArticlesEditOwnDraft,
            PermissionCodes.ArticlesEditAnyDraft,
            PermissionCodes.ArticlesSubmitForReview,
            PermissionCodes.ArticlesReview,
            PermissionCodes.ArticlesPublish,
            PermissionCodes.ArticlesDelete,
            PermissionCodes.VersionsView,
            PermissionCodes.VersionsRestore,
            PermissionCodes.LocksManage,
            PermissionCodes.CommentsCreate,
            PermissionCodes.SuggestionsCreate
        };
        var granted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var code in permissionCodes)
        {
            if (await permissionChecker.HasPermissionAsync(actorId, code, cancellationToken))
                granted.Add(code);
        }
        var isOwner = draft.ArticleOwnerId == actorId;
        var hasReviewPermission = isAdmin || granted.Contains(PermissionCodes.ArticlesReview);
        var hasPublishPermission = isAdmin || granted.Contains(PermissionCodes.ArticlesPublish);
        var canEditPermission = granted.Contains(PermissionCodes.ArticlesEditAnyDraft) ||
                                isOwner && granted.Contains(PermissionCodes.ArticlesEditOwnDraft);
        var unlocked = !draft.IsLocked;
        var editable = draft.DraftStatus is ArticleStatuses.Draft or ArticleStatuses.ChangesRequested;
        var reviewable = IsReviewable(draft.DraftStatus);
        var canSubmit = isOwner && unlocked &&
                        granted.Contains(PermissionCodes.ArticlesSubmitForReview) &&
                        draft.DraftStatus == ArticleStatuses.Draft;
        var canResubmit = isOwner && unlocked &&
                          granted.Contains(PermissionCodes.ArticlesSubmitForReview) &&
                          draft.DraftStatus == ArticleStatuses.ChangesRequested;
        var canReview = unlocked && hasReviewPermission &&
                        draft.DraftStatus is ArticleStatuses.SubmittedForReview or ArticleStatuses.Resubmitted;
        var canRequestChanges = unlocked && hasReviewPermission && reviewable;
        var canApprove = canRequestChanges && (!isOwner || isAdmin);
        var canPublish = unlocked && hasPublishPermission &&
                         draft.DraftStatus == ArticleStatuses.Approved;
        var canViewVersions = granted.Contains(PermissionCodes.VersionsView);
        var canRestore = unlocked && granted.Contains(PermissionCodes.VersionsRestore) &&
                         IsReplaceableByRestore(draft.DraftStatus);

        var overrideTargets = new List<string>();
        if (unlocked && (isAdmin || granted.Contains(PermissionCodes.ArticlesEditAnyDraft)))
        {
            if (isAdmin || granted.Contains(PermissionCodes.ArticlesSubmitForReview))
                overrideTargets.AddRange([
                    ArticleStatuses.Draft,
                    ArticleStatuses.SubmittedForReview,
                    ArticleStatuses.Resubmitted
                ]);
            if (hasReviewPermission)
                overrideTargets.AddRange([
                    ArticleStatuses.InReview,
                    ArticleStatuses.ChangesRequested
                ]);
            if ((!isOwner || isAdmin) && hasReviewPermission)
                overrideTargets.Add(ArticleStatuses.Approved);
        }
        overrideTargets.RemoveAll(status => status == draft.DraftStatus);

        return new(
            editable && canEditPermission,
            canSubmit || canResubmit,
            canReview,
            canRequestChanges,
            canApprove,
            canPublish,
            unlocked && granted.Contains(PermissionCodes.ArticlesDelete),
            canViewVersions,
            canRestore,
            editable && canEditPermission && unlocked,
            draft.IsLocked && draft.LockedById == actorId,
            granted.Contains(PermissionCodes.CommentsCreate),
            granted.Contains(PermissionCodes.SuggestionsCreate),
            overrideTargets.Count > 0,
            overrideTargets);
    }

    public async Task<IReadOnlyList<LifecycleReviewEventData>> GetReviewHistoryAsync(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        await GetCurrentActiveAsync(articleId, cancellationToken);
        return await repository.GetReviewHistoryAsync(articleId, cancellationToken);
    }

    public async Task<PagedLifecycleVersionData> GetVersionsAsync(
        Guid articleId,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        if (page < 1)
            throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize is < 1 or > MaxVersionPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaxVersionPageSize}.");
        await GetCurrentActiveAsync(articleId, cancellationToken);
        await RequirePermissionAsync(PermissionCodes.VersionsView, cancellationToken);
        return await repository.GetVersionsAsync(articleId, page, pageSize, cancellationToken);
    }

    public async Task<LifecycleVersionDetailsData> GetVersionDetailsAsync(
        Guid articleId,
        Guid versionId,
        CancellationToken cancellationToken)
    {
        EnsureId(versionId, "Version");
        await GetCurrentActiveAsync(articleId, cancellationToken);
        await RequirePermissionAsync(PermissionCodes.VersionsView, cancellationToken);
        var version = await repository.GetVersionSummaryAsync(articleId, versionId, cancellationToken)
            ?? throw new NotFoundException("The article version was not found.");
        var content = await DownloadVersionContentAsync(version, cancellationToken);
        return new(version, content.PlainText, content.RenderedHtml);
    }

    public async Task<LifecyclePublishedVersionData> GetPublishedVersionAsync(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        await GetCurrentActiveAsync(articleId, cancellationToken);
        var version = await repository.GetPublishedVersionAsync(articleId, cancellationToken)
            ?? throw new NotFoundException("The article does not have a published version.");
        return new(version, await DownloadContentAsync(version.ContentJsonPath, cancellationToken));
    }

    public async Task<LifecycleVersionComparisonData> CompareVersionsAsync(
        Guid articleId,
        Guid baseVersionId,
        Guid targetVersionId,
        CancellationToken cancellationToken)
    {
        EnsureId(baseVersionId, "Base version");
        EnsureId(targetVersionId, "Target version");
        if (baseVersionId == targetVersionId)
            throw new BusinessRuleException("Select two different article versions to compare.");
        await GetCurrentActiveAsync(articleId, cancellationToken);
        await RequirePermissionAsync(PermissionCodes.VersionsView, cancellationToken);

        var summaries = await Task.WhenAll(
            repository.GetVersionSummaryAsync(articleId, baseVersionId, cancellationToken),
            repository.GetVersionSummaryAsync(articleId, targetVersionId, cancellationToken));
        var baseVersion = summaries[0]
            ?? throw new NotFoundException("The base article version was not found.");
        var targetVersion = summaries[1]
            ?? throw new NotFoundException("The target article version was not found.");
        var contents = await Task.WhenAll(
            DownloadContentAsync(baseVersion.ContentJsonPath, cancellationToken),
            DownloadContentAsync(targetVersion.ContentJsonPath, cancellationToken));
        return TiptapVersionDiff.Compare(baseVersion, contents[0], targetVersion, contents[1]);
    }

    public Task<LifecycleResultData> SubmitAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken) =>
        AuthorTransitionAsync(articleId, command, ArticleStatuses.Draft, ArticleStatuses.SubmittedForReview,
            ReviewActions.SubmitForReview, ArticleAuditActions.SubmittedForReview,
            ArticleSnapshotReasons.SubmittedForReview, cancellationToken);

    public Task<LifecycleResultData> ResubmitAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken) =>
        AuthorTransitionAsync(articleId, command, ArticleStatuses.ChangesRequested, ArticleStatuses.Resubmitted,
            ReviewActions.Resubmit, ArticleAuditActions.Resubmitted,
            ArticleSnapshotReasons.ResubmittedForReview, cancellationToken);

    public Task<LifecycleResultData> StartReviewAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken) =>
        ReviewerTransitionAsync(articleId, command,
            [ArticleStatuses.SubmittedForReview, ArticleStatuses.Resubmitted],
            ArticleStatuses.InReview, ReviewActions.StartReview, ArticleAuditActions.ReviewStarted,
            preventSelfApproval: false, snapshotReason: null, cancellationToken);

    public Task<LifecycleResultData> RequestChangesAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Comment))
            throw new BusinessRuleException("A reason is required when requesting changes.");
        return ReviewerTransitionAsync(articleId, command,
            [ArticleStatuses.SubmittedForReview, ArticleStatuses.InReview, ArticleStatuses.Resubmitted],
            ArticleStatuses.ChangesRequested, ReviewActions.RequestChanges, ArticleAuditActions.ChangesRequested,
            preventSelfApproval: false, snapshotReason: null, cancellationToken);
    }

    public Task<LifecycleResultData> ApproveAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken) =>
        ReviewerTransitionAsync(articleId, command,
            [ArticleStatuses.SubmittedForReview, ArticleStatuses.InReview, ArticleStatuses.Resubmitted],
            ArticleStatuses.Approved, ReviewActions.Approve, ArticleAuditActions.Approved,
            preventSelfApproval: true, snapshotReason: ArticleSnapshotReasons.Approved, cancellationToken);

    public Task<LifecycleResultData> RejectAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Comment))
            throw new BusinessRuleException("A reason is required when rejecting an article.");
        return ReviewerTransitionAsync(articleId, command,
            [ArticleStatuses.SubmittedForReview, ArticleStatuses.InReview, ArticleStatuses.Resubmitted],
            ArticleStatuses.ChangesRequested, ReviewActions.Reject, ArticleAuditActions.Rejected,
            preventSelfApproval: true, snapshotReason: null, cancellationToken);
    }

    public async Task<LifecycleResultData> PublishAsync(
        Guid articleId,
        LifecycleCommand command,
        CancellationToken cancellationToken)
    {
        var draft = await LoadAndValidateAsync(articleId, command.RowVersion, cancellationToken);
        await RequirePermissionOrAdminAsync(PermissionCodes.ArticlesPublish, cancellationToken);
        EnsureTransition(draft.DraftStatus, ArticleStatuses.Published);
        EnsureUnlocked(draft);
        if (string.IsNullOrWhiteSpace(draft.ContentJsonPath))
            throw new ConflictException("An empty draft cannot be published.");

        var uploaded = new List<string>(3);
        VersionSnapshotContentData staged;
        try
        {
            staged = await StageSnapshotAsync(
                articleId, draft, ArticleSnapshotReasons.Published, uploaded, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            await DeleteBestEffortAsync(uploaded);
            throw;
        }
        catch (Exception exception)
        {
            await DeleteBestEffortAsync(uploaded);
            throw new ExternalServiceException("Approved draft content could not be copied for publishing.", exception);
        }

        try
        {
            var actorId = currentUser.UserId;
            var now = timeProvider.GetUtcNow().UtcDateTime;
            var result = await repository.PublishAsync(articleId, draft.DraftId, command.RowVersion, staged,
                Review(actorId, ReviewActions.Publish, command.Comment, draft.DraftStatus,
                    ArticleStatuses.Published, now),
                Audit(actorId, ArticleAuditActions.Published, articleId, draft.DraftId,
                    draft.DraftStatus, ArticleStatuses.Published, command.Comment,
                    new { versionId = staged.VersionId }, false, now),
                SnapshotAudit(actorId, articleId, draft, staged, now),
                cancellationToken);
            if (notificationService is not null)
                await notificationService.NotifyWorkflowAsync(articleId, NotificationTypes.ArticlePublished,
                    actorId, command.Comment, cancellationToken);
            return result;
        }
        catch
        {
            await DeleteBestEffortAsync(uploaded);
            throw;
        }
    }

    public async Task<LifecycleResultData> OverrideAsync(
        Guid articleId,
        WorkflowOverrideCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Reason))
            throw new BusinessRuleException("A workflow override reason is required.");
        var target = OverrideStatuses.FirstOrDefault(status =>
            status.Equals(command.TargetStatus?.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw new BusinessRuleException("The workflow override target status is not supported.");

        var draft = await LoadAndValidateAsync(articleId, command.RowVersion, cancellationToken);
        var isAdmin = await adminChecker.IsAdminAsync(currentUser.UserId, cancellationToken);
        if (!isAdmin)
        {
            await RequirePermissionAsync(PermissionCodes.ArticlesEditAnyDraft, cancellationToken);
            await RequirePermissionAsync(TargetPermission(target), cancellationToken);
        }
        EnsureUnlocked(draft);
        if (target == ArticleStatuses.Approved && draft.ArticleOwnerId == currentUser.UserId && !isAdmin)
            throw new ForbiddenException("Reviewers cannot approve their own articles.");
        if (draft.DraftStatus == target)
            throw new ConflictException($"The article is already in the {target} state.");

        var actorId = currentUser.UserId;
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return await repository.TransitionAsync(articleId, draft.DraftId, command.RowVersion,
            draft.DraftStatus, target,
            Review(actorId, ReviewActions.Override, command.Reason, draft.DraftStatus, target, now),
            Audit(actorId, ArticleAuditActions.WorkflowOverridden, articleId, draft.DraftId,
                draft.DraftStatus, target, command.Reason, null, true, now),
            snapshot: null, snapshotAudit: null, isOverride: true, cancellationToken);
    }

    public async Task<LifecycleResultData> RestoreAsync(
        Guid articleId,
        Guid versionId,
        RestoreArticleVersionCommand command,
        CancellationToken cancellationToken)
    {
        EnsureId(versionId, "Version");
        var current = await LoadAndValidateAsync(articleId, command.RowVersion, cancellationToken);
        await RequirePermissionAsync(PermissionCodes.VersionsRestore, cancellationToken);
        if (current.IsLocked)
            throw new ConflictException("The current draft must be unlocked before restoring a version.");
        if (!IsReplaceableByRestore(current.DraftStatus))
            throw new ConflictException(
                "A version can only replace a published, draft, or changes-requested current draft.");

        var version = await repository.GetVersionAsync(articleId, versionId, cancellationToken)
            ?? throw new NotFoundException("The article version was not found.");
        var newDraftId = Guid.NewGuid();
        var uploaded = new List<string>(3);
        RestoredDraftContentData staged;
        try
        {
            var prefix = $"articles/{articleId:N}/drafts/{newDraftId:N}/restored/{versionId:N}";
            var jsonPath = await CopyAsync(version.ContentJsonPath, $"{prefix}/content.json",
                "application/json", uploaded, cancellationToken);
            var htmlPath = version.RenderedHtmlPath is null ? null : await CopyAsync(
                version.RenderedHtmlPath, $"{prefix}/content.html", "text/html; charset=utf-8",
                uploaded, cancellationToken);
            var textPath = version.PlainTextPath is null ? null : await CopyAsync(
                version.PlainTextPath, $"{prefix}/content.txt", "text/plain; charset=utf-8",
                uploaded, cancellationToken);
            staged = new(newDraftId, jsonPath, htmlPath, textPath, version.ContentHash,
                version.ContentSizeBytes, version.VersionId, version.VersionNumber);
        }
        catch (OperationCanceledException)
        {
            await DeleteBestEffortAsync(uploaded);
            throw;
        }
        catch (Exception exception)
        {
            await DeleteBestEffortAsync(uploaded);
            throw new ExternalServiceException("Article version content could not be copied into a new draft.", exception);
        }

        try
        {
            var actorId = currentUser.UserId;
            var now = timeProvider.GetUtcNow().UtcDateTime;
            return await repository.RestoreAsync(articleId, current.DraftId, command.RowVersion,
                versionId, staged,
                Audit(actorId, ArticleAuditActions.Restored, articleId, newDraftId,
                    current.DraftStatus, ArticleStatuses.Draft, null,
                    new { sourceVersionId = versionId, sourceVersionNumber = version.VersionNumber }, false, now),
                cancellationToken);
        }
        catch
        {
            await DeleteBestEffortAsync(uploaded);
            throw;
        }
    }

    public async Task ArchiveAsync(
        Guid articleId,
        byte[] expectedRowVersion,
        CancellationToken cancellationToken)
    {
        var draft = await LoadAndValidateAsync(articleId, expectedRowVersion, cancellationToken);
        await RequirePermissionAsync(PermissionCodes.ArticlesDelete, cancellationToken);
        EnsureUnlocked(draft);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        await repository.ArchiveAsync(articleId, draft.DraftId, expectedRowVersion,
            Audit(currentUser.UserId, ArticleAuditActions.Deleted, articleId, draft.DraftId,
                draft.ArticleStatus, ArticleStatuses.Deleted, null, null, false, now), cancellationToken);
    }

    private async Task<LifecycleResultData> AuthorTransitionAsync(
        Guid articleId,
        LifecycleCommand command,
        string expectedStatus,
        string newStatus,
        string action,
        string auditAction,
        string snapshotReason,
        CancellationToken cancellationToken)
    {
        var draft = await LoadAndValidateAsync(articleId, command.RowVersion, cancellationToken);
        await RequirePermissionAsync(PermissionCodes.ArticlesSubmitForReview, cancellationToken);
        if (draft.ArticleOwnerId != currentUser.UserId)
            throw new ForbiddenException("Only the article author can submit this draft.");
        if (draft.DraftStatus != expectedStatus)
            throw InvalidTransition(draft.DraftStatus, newStatus);
        EnsureTransition(draft.DraftStatus, newStatus);
        EnsureUnlocked(draft);
        return await TransitionAsync(articleId, draft, command, newStatus, action, auditAction, false,
            snapshotReason,
            cancellationToken);
    }

    private async Task<LifecycleResultData> ReviewerTransitionAsync(
        Guid articleId,
        LifecycleCommand command,
        IReadOnlyCollection<string> allowedFrom,
        string newStatus,
        string action,
        string auditAction,
        bool preventSelfApproval,
        string? snapshotReason,
        CancellationToken cancellationToken)
    {
        var draft = await LoadAndValidateAsync(articleId, command.RowVersion, cancellationToken);
        await RequirePermissionOrAdminAsync(PermissionCodes.ArticlesReview, cancellationToken);
        if (!allowedFrom.Contains(draft.DraftStatus, StringComparer.Ordinal))
            throw InvalidTransition(draft.DraftStatus, newStatus);
        if (preventSelfApproval && draft.ArticleOwnerId == currentUser.UserId &&
            !await adminChecker.IsAdminAsync(currentUser.UserId, cancellationToken))
            throw new ForbiddenException("Reviewers cannot approve their own articles.");
        EnsureTransition(draft.DraftStatus, newStatus);
        EnsureUnlocked(draft);
        return await TransitionAsync(articleId, draft, command, newStatus, action, auditAction, false,
            snapshotReason,
            cancellationToken);
    }

    private async Task<LifecycleResultData> TransitionAsync(
        Guid articleId,
        LifecycleDraftData draft,
        LifecycleCommand command,
        string newStatus,
        string action,
        string auditAction,
        bool isOverride,
        string? snapshotReason,
        CancellationToken cancellationToken)
    {
        var actorId = currentUser.UserId;
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var uploaded = new List<string>(3);
        VersionSnapshotContentData? snapshot = null;
        try
        {
            if (snapshotReason is not null)
                snapshot = await StageSnapshotAsync(
                    articleId, draft, snapshotReason, uploaded, cancellationToken);
            var result = await repository.TransitionAsync(articleId, draft.DraftId, command.RowVersion,
                draft.DraftStatus, newStatus,
                Review(actorId, action, NormalizeComment(command.Comment), draft.DraftStatus, newStatus, now),
                Audit(actorId, auditAction, articleId, draft.DraftId, draft.DraftStatus, newStatus,
                    command.Comment, null, isOverride, now),
                snapshot,
                snapshot is null ? null : SnapshotAudit(actorId, articleId, draft, snapshot, now),
                isOverride, cancellationToken);
            if (notificationService is not null && NotificationType(action) is { } notificationType)
                await notificationService.NotifyWorkflowAsync(articleId, notificationType, actorId,
                    command.Comment, cancellationToken);
            return result;
        }
        catch (OperationCanceledException)
        {
            await DeleteBestEffortAsync(uploaded);
            throw;
        }
        catch (Exception exception) when (snapshotReason is not null && snapshot is null)
        {
            await DeleteBestEffortAsync(uploaded);
            throw new ExternalServiceException("Draft content could not be copied into a version snapshot.", exception);
        }
        catch
        {
            await DeleteBestEffortAsync(uploaded);
            throw;
        }
    }

    private async Task<LifecycleDraftData> LoadAndValidateAsync(
        Guid articleId,
        byte[] expectedRowVersion,
        CancellationToken cancellationToken)
    {
        EnsureId(articleId, "Article");
        EnsureAuthenticated();
        if (expectedRowVersion is null || expectedRowVersion.Length == 0)
            throw new BusinessRuleException("Row version is required.");
        var draft = await repository.GetCurrentAsync(articleId, cancellationToken)
            ?? throw new NotFoundException("The article or its current draft was not found.");
        if (draft.IsDeleted)
            throw new NotFoundException("The article was not found.");
        if (!draft.RowVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ConcurrencyConflictException();
        return draft;
    }

    private async Task<LifecycleDraftData> GetCurrentActiveAsync(
        Guid articleId,
        CancellationToken cancellationToken)
    {
        EnsureId(articleId, "Article");
        EnsureAuthenticated();
        var draft = await repository.GetCurrentAsync(articleId, cancellationToken)
            ?? throw new NotFoundException("The article or its current draft was not found.");
        if (draft.IsDeleted)
            throw new NotFoundException("The article was not found.");
        return draft;
    }

    private async Task RequirePermissionAsync(string permission, CancellationToken cancellationToken)
    {
        EnsureAuthenticated();
        if (!await permissionChecker.HasPermissionAsync(currentUser.UserId, permission, cancellationToken))
            throw new ForbiddenException();
    }

    private async Task RequirePermissionOrAdminAsync(string permission, CancellationToken cancellationToken)
    {
        EnsureAuthenticated();
        if (!await permissionChecker.HasPermissionAsync(currentUser.UserId, permission, cancellationToken) &&
            !await adminChecker.IsAdminAsync(currentUser.UserId, cancellationToken))
            throw new ForbiddenException();
    }

    private async Task<string> CopyAsync(
        string sourcePath,
        string destinationPath,
        string contentType,
        IList<string> uploaded,
        CancellationToken cancellationToken)
    {
        await using var source = await storage.DownloadAsync(options.ContainerName, sourcePath, cancellationToken);
        using var buffered = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var read = await source.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            if (buffered.Length + read > options.MaxContentSizeBytes)
                throw new InvalidDataException("Stored article content exceeds the configured size limit.");
            await buffered.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        buffered.Position = 0;
        uploaded.Add(destinationPath);
        var storedPath = await storage.UploadAsync(options.ContainerName, destinationPath, buffered,
            contentType, cancellationToken);
        if (string.IsNullOrWhiteSpace(storedPath))
            throw new InvalidOperationException("Object storage returned an empty object identifier.");
        if (!string.Equals(storedPath, destinationPath, StringComparison.Ordinal))
        {
            uploaded.Remove(destinationPath);
            uploaded.Add(storedPath);
        }
        return storedPath;
    }

    private async Task<VersionSnapshotContentData> StageSnapshotAsync(
        Guid articleId,
        LifecycleDraftData draft,
        string snapshotReason,
        IList<string> uploaded,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(draft.ContentJsonPath))
            throw new ConflictException("An empty draft cannot be captured as a version.");
        if (!ArticleSnapshotReasons.All.Contains(snapshotReason))
            throw new BusinessRuleException("The snapshot reason is not supported.");

        var versionId = Guid.NewGuid();
        var prefix = $"articles/{articleId:N}/versions/{versionId:N}";
        var jsonPath = await CopyAsync(draft.ContentJsonPath, $"{prefix}/content.json",
            "application/json", uploaded, cancellationToken);
        var htmlPath = draft.RenderedHtmlPath is null ? null : await CopyAsync(
            draft.RenderedHtmlPath, $"{prefix}/content.html", "text/html; charset=utf-8",
            uploaded, cancellationToken);
        var textPath = draft.PlainTextPath is null ? null : await CopyAsync(
            draft.PlainTextPath, $"{prefix}/content.txt", "text/plain; charset=utf-8",
            uploaded, cancellationToken);
        return new(versionId, jsonPath, htmlPath, textPath, draft.ContentHash,
            draft.ContentSizeBytes, snapshotReason);
    }

    private async Task<(string PlainText, string? RenderedHtml)> DownloadVersionContentAsync(
        LifecycleVersionSummaryData version,
        CancellationToken cancellationToken)
    {
        var json = await DownloadContentAsync(version.ContentJsonPath, cancellationToken);
        string? renderedHtml = null;
        string? plainText = null;
        if (version.RenderedHtmlPath is not null)
            renderedHtml = await DownloadTextAsync(
                version.RenderedHtmlPath, "rendered HTML", cancellationToken);
        if (version.PlainTextPath is not null)
            plainText = await DownloadTextAsync(
                version.PlainTextPath, "plain text", cancellationToken);
        return (plainText ?? TiptapVersionDiff.ToPlainText(json), renderedHtml);
    }

    private async Task<string> DownloadTextAsync(
        string objectName,
        string contentName,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var source = await storage.DownloadAsync(
                options.ContainerName, objectName, cancellationToken);
            using var destination = new MemoryStream();
            var buffer = new byte[81920];
            while (true)
            {
                var read = await source.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;
                if (destination.Length + read > options.MaxContentSizeBytes)
                    throw new InvalidDataException(
                        $"Stored article {contentName} exceeds the configured size limit.");
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }
            return System.Text.Encoding.UTF8.GetString(destination.ToArray());
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new ExternalServiceException(
                $"Article version {contentName} could not be loaded from object storage.", exception);
        }
    }

    private async Task<JsonElement> DownloadContentAsync(
        string objectName,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var source = await storage.DownloadAsync(options.ContainerName, objectName, cancellationToken);
            using var destination = new MemoryStream();
            var buffer = new byte[81920];
            while (true)
            {
                var read = await source.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;
                if (destination.Length + read > options.MaxContentSizeBytes)
                    throw new InvalidDataException("Stored article content exceeds the configured size limit.");
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }
            using var document = JsonDocument.Parse(destination.ToArray());
            var content = document.RootElement;
            if (content.ValueKind != JsonValueKind.Object ||
                !content.TryGetProperty("type", out var type) || type.GetString() != "doc")
                throw new JsonException("Stored article content does not have a Tiptap doc root.");
            return content.Clone();
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new ExternalServiceException("Article version content could not be loaded from object storage.",
                exception);
        }
    }

    private async Task DeleteBestEffortAsync(IEnumerable<string> paths)
    {
        foreach (var path in paths.Distinct(StringComparer.Ordinal))
        {
            try
            {
                await storage.DeleteAsync(options.ContainerName, path, CancellationToken.None);
            }
            catch
            {
                // Published/restored staging objects are cleaned by the orphan cleanup process if deletion fails.
            }
        }
    }

    private static LifecycleReviewData Review(
        Guid actorId,
        string action,
        string? comment,
        string fromStatus,
        string toStatus,
        DateTime createdAt) =>
        new(actorId, action, NormalizeComment(comment), fromStatus, toStatus, createdAt);

    private static LifecycleAuditData Audit(
        Guid actorId,
        string action,
        Guid articleId,
        Guid draftId,
        string previousState,
        string newState,
        string? comment,
        object? additional,
        bool isOverride,
        DateTime createdAt) =>
        new(actorId, action, JsonSerializer.Serialize(new
        {
            articleId,
            draftId,
            previousState,
            newState,
            comment = NormalizeComment(comment),
            isOverride,
            additional
        }), createdAt);

    private static LifecycleAuditData SnapshotAudit(
        Guid actorId,
        Guid articleId,
        LifecycleDraftData draft,
        VersionSnapshotContentData snapshot,
        DateTime createdAt) =>
        new(actorId, ArticleAuditActions.VersionCreated, JsonSerializer.Serialize(new
        {
            articleId,
            versionId = snapshot.VersionId,
            sourceDraftId = draft.DraftId,
            sourceDraftNumber = draft.DraftNumber,
            snapshotReason = snapshot.SnapshotReason,
            snapshot.ContentHash
        }), createdAt);

    private static void EnsureTransition(string fromStatus, string toStatus)
    {
        if (!ArticleWorkflow.CanTransition(fromStatus, toStatus))
            throw InvalidTransition(fromStatus, toStatus);
    }

    private static ConflictException InvalidTransition(string fromStatus, string toStatus) =>
        new($"The article cannot transition from {fromStatus} to {toStatus}.");

    private static void EnsureUnlocked(LifecycleDraftData draft)
    {
        if (draft.IsLocked)
            throw new ConflictException("The draft must be unlocked before changing workflow state.");
    }

    private static string TargetPermission(string target) => target switch
    {
        ArticleStatuses.Draft or ArticleStatuses.SubmittedForReview or ArticleStatuses.Resubmitted =>
            PermissionCodes.ArticlesSubmitForReview,
        ArticleStatuses.InReview or ArticleStatuses.ChangesRequested or ArticleStatuses.Approved =>
            PermissionCodes.ArticlesReview,
        _ => throw new BusinessRuleException("The workflow override target status is not supported.")
    };

    private static bool IsReplaceableByRestore(string status) =>
        status is ArticleStatuses.Published or ArticleStatuses.Draft or ArticleStatuses.ChangesRequested;

    private static bool IsReviewable(string status) =>
        status is ArticleStatuses.SubmittedForReview or ArticleStatuses.InReview or ArticleStatuses.Resubmitted;

    private static string? NotificationType(string action) => action switch
    {
        ReviewActions.SubmitForReview or ReviewActions.Resubmit =>
            NotificationTypes.ArticleSubmittedForReview,
        ReviewActions.RequestChanges => NotificationTypes.ArticleChangesRequested,
        ReviewActions.Approve => NotificationTypes.ArticleApproved,
        ReviewActions.Reject => NotificationTypes.ArticleRejected,
        _ => null
    };

    private void EnsureAuthenticated()
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException();
    }

    private static void EnsureId(Guid id, string name)
    {
        if (id == Guid.Empty)
            throw new BusinessRuleException($"{name} ID must not be an empty GUID.");
    }

    private static string? NormalizeComment(string? comment) =>
        string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
}
