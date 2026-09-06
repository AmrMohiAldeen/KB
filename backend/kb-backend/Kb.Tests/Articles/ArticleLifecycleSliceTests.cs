using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Application.Lifecycle;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Lifecycle;
using Kb.Infrastructure.Drafts;
using Kb.Infrastructure.Authorization;
using Kb.Application.Notifications;
using Kb.Application.Translations;
using Kb.Infrastructure.Notifications;
using Kb.Infrastructure.Translations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Articles;

public sealed class ArticleLifecycleSliceTests
{
    [Fact]
    public async Task Complete_lifecycle_creates_review_events_audits_version_and_search_job()
    {
        await using var f = await Fixture.CreateAsync();
        var reviewerRoleId = Guid.NewGuid();
        f.Context.Roles.Add(new Role { RoleId = reviewerRoleId, RoleName = "Lifecycle Reviewer" });
        f.Context.RolePermissions.Add(new RolePermission
            { RoleIdFk = reviewerRoleId, PermissionCode = PermissionCodes.ArticlesReview });
        f.Context.UserRoles.Add(new UserRole
            { UserId = f.ReviewerId, RoleId = reviewerRoleId, AssignedAt = DateTime.UtcNow });
        await f.Context.SaveChangesAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesSubmitForReview);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);

        var submitted = await f.Service.SubmitAsync(f.ArticleId,
            new(f.RowVersion, "Ready"), default);
        f.Current.UserId = f.ReviewerId;
        var started = await f.Service.StartReviewAsync(f.ArticleId,
            new(submitted.RowVersion, "Taking review"), default);
        var changes = await f.Service.RequestChangesAsync(f.ArticleId,
            new(started.RowVersion, "Add an example"), default);
        await f.UpdateDraftContentAsync("Added example");
        f.Current.UserId = f.AuthorId;
        var secondSubmission = await f.Service.SubmitAsync(f.ArticleId,
            new(changes.RowVersion, "Added"), default);
        f.Current.UserId = f.ReviewerId;
        var restarted = await f.Service.StartReviewAsync(f.ArticleId,
            new(secondSubmission.RowVersion), default);
        var approved = await f.Service.ApproveAsync(f.ArticleId,
            new(restarted.RowVersion, "Approved"), default);
        Assert.Equal(2, await f.Context.ArticleVersions.CountAsync());
        f.Current.UserId = f.PublisherId;
        var published = await f.Service.PublishAsync(f.ArticleId,
            new(approved.RowVersion, "Ship it"), default);

        Assert.Equal(ArticleStatuses.Published, published.Status);
        Assert.Equal(3, published.PublishedVersionNumber);
        Assert.NotNull(published.PublishedVersionId);
        f.Context.ChangeTracker.Clear();
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(published.PublishedVersionId, article.LastPublishedVersionIdFk);
        Assert.Equal(ArticleStatuses.Published, article.Status);
        Assert.Equal(f.DraftId, article.CurrentDraftIdFk);
        Assert.Equal(ArticleStatuses.Approved,
            (await f.Context.ArticleDrafts.AsNoTracking().SingleAsync()).Status);
        var versions = await f.Context.ArticleVersions.AsNoTracking()
            .OrderBy(version => version.VersionNumber).ToArrayAsync();
        Assert.Equal(
            [
                ArticleSnapshotReasons.SubmittedForReview,
                ArticleSnapshotReasons.SubmittedForReview,
                ArticleSnapshotReasons.Published
            ],
            versions.Select(version => version.SnapshotReason));
        var version = versions[^1];
        Assert.Equal(f.PublisherId, version.PublishedByFk);
        Assert.Equal(f.DraftId, version.SourceDraftIdFk);
        Assert.Equal(1, version.SourceDraftNumber);
        Assert.NotEqual(f.DraftContentPath, version.ContentJsonStoragePath);
        Assert.Equal(f.Storage.Get(f.DraftContentPath), f.Storage.Get(version.ContentJsonStoragePath));
        var job = await f.Context.SearchIndexJobs.AsNoTracking().SingleAsync();
        Assert.Equal((SearchIndexJobTypes.Upsert, JobStatuses.Pending, SearchIndexScopes.Internal),
            (job.JobType, job.Status, job.IndexScope));
        Assert.Null(job.VersionIdFk);
        Assert.Equal(7, await f.Context.ArticleReviewEvents.CountAsync());
        var changeRequest = await f.Context.ArticleReviewEvents.AsNoTracking().SingleAsync(value =>
            value.Action == ReviewActions.RequestChanges);
        Assert.Equal("Add an example", changeRequest.Comment);
        Assert.Equal(f.ReviewerId, changeRequest.ActorIdFk);
        Assert.NotEqual(default, changeRequest.CreatedAt);
        Assert.Equal(10, await f.Context.ArticleAuditLogs.CountAsync());
        Assert.Equal(3, await f.Context.ArticleAuditLogs.CountAsync(
            log => log.ActionType == ArticleAuditActions.VersionCreated));
        var versionAudit = await f.Context.ArticleAuditLogs.AsNoTracking().SingleAsync(
            log => log.EntityId == version.VersionId &&
                   log.ActionType == ArticleAuditActions.VersionCreated);
        using var versionMetadata = JsonDocument.Parse(versionAudit.MetaDataJson!);
        Assert.Equal(3, versionMetadata.RootElement.GetProperty("versionNumber").GetInt32());
        Assert.Equal(ArticleSnapshotReasons.Published,
            versionMetadata.RootElement.GetProperty("snapshotReason").GetString());
        var publishAudit = await f.Context.ArticleAuditLogs.SingleAsync(
            log => log.ActionType == ArticleAuditActions.Published);
        using var metadata = JsonDocument.Parse(publishAudit.MetaDataJson!);
        Assert.Equal(ArticleStatuses.Approved,
            metadata.RootElement.GetProperty("previousState").GetString());
        Assert.Equal(ArticleStatuses.Published,
            metadata.RootElement.GetProperty("newState").GetString());
        var notifications = await f.Context.Notifications.AsNoTracking().ToArrayAsync();
        Assert.Equal(6, notifications.Length);
        Assert.Equal(3, notifications.Count(value => value.UserIdFk == f.AuthorId));
        Assert.Equal(3, notifications.Count(value => value.UserIdFk == f.ReviewerId));
        Assert.Contains(notifications, value =>
            value.Type == NotificationTypes.ArticleSubmittedForReview && value.UserIdFk == f.ReviewerId);
        Assert.Contains(notifications, value =>
            value.Type == NotificationTypes.ArticleChangesRequested && value.UserIdFk == f.AuthorId);
        Assert.Contains(notifications, value =>
            value.Type == NotificationTypes.ArticleApproved && value.UserIdFk == f.AuthorId);
        Assert.Contains(notifications, value => value.Type == NotificationTypes.ArticlePublished);
    }

    [Fact]
    public async Task Unchanged_resubmission_approve_and_publish_do_not_create_duplicate_versions()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesSubmitForReview);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);

        var submitted = await f.Service.SubmitAsync(f.ArticleId, new(f.RowVersion), default);
        Assert.Single(await f.Context.ArticleVersions.AsNoTracking().ToListAsync());
        f.Current.UserId = f.ReviewerId;
        var changes = await f.Service.RequestChangesAsync(
            f.ArticleId, new(submitted.RowVersion, "Clarify without changing the saved body"), default);
        Assert.Single(await f.Context.ArticleVersions.AsNoTracking().ToListAsync());
        f.Current.UserId = f.AuthorId;
        var resubmitted = await f.Service.SubmitAsync(f.ArticleId, new(changes.RowVersion), default);
        Assert.Single(await f.Context.ArticleVersions.AsNoTracking().ToListAsync());
        f.Current.UserId = f.ReviewerId;
        var approved = await f.Service.ApproveAsync(f.ArticleId, new(resubmitted.RowVersion), default);
        Assert.Single(await f.Context.ArticleVersions.AsNoTracking().ToListAsync());
        f.Current.UserId = f.PublisherId;
        var published = await f.Service.PublishAsync(f.ArticleId, new(approved.RowVersion), default);

        var version = await f.Context.ArticleVersions.AsNoTracking()
            .SingleAsync(item => item.VersionId == published.PublishedVersionId);
        Assert.Equal(version.VersionId, published.PublishedVersionId);
        Assert.Equal(2, published.PublishedVersionNumber);
        Assert.Equal(f.PublisherId, version.PublishedByFk);
        Assert.NotNull(version.PublishedAt);
    }

    [Fact]
    public async Task Unchanged_post_publish_revision_still_creates_a_new_immutable_published_version()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var originalId = (await f.Context.Articles.AsNoTracking().SingleAsync()).LastPublishedVersionIdFk;
        var original = await f.Context.ArticleVersions.AsNoTracking()
            .SingleAsync(item => item.VersionId == originalId);
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft, PermissionCodes.ArticlesSubmitForReview);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Current.UserId = f.AuthorId;

        var revision = await f.Service.RestoreAsync(
            f.ArticleId, original.VersionId, new(f.RowVersion), default);
        Assert.Equal(ArticleStatuses.Published, revision.Status);
        var duringEditing = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleStatuses.Published, duringEditing.Status);
        Assert.Equal(original.VersionId, duringEditing.LastPublishedVersionIdFk);
        var submitted = await f.Service.SubmitAsync(f.ArticleId, new(revision.RowVersion), default);
        Assert.Equal(ArticleStatuses.Published, submitted.Status);
        Assert.Equal(ArticleStatuses.SubmittedForReview,
            (await f.Context.ArticleDrafts.AsNoTracking()
                .SingleAsync(draft => draft.DraftId == revision.DraftId)).Status);
        Assert.Equal(3, await f.Context.ArticleVersions.AsNoTracking().CountAsync());
        f.Current.UserId = f.ReviewerId;
        var approved = await f.Service.ApproveAsync(f.ArticleId, new(submitted.RowVersion), default);
        Assert.Equal(original.VersionId,
            (await f.Context.Articles.AsNoTracking().SingleAsync()).LastPublishedVersionIdFk);
        f.Current.UserId = f.PublisherId;
        var republished = await f.Service.PublishAsync(f.ArticleId, new(approved.RowVersion), default);

        Assert.NotEqual(original.VersionId, republished.PublishedVersionId);
        Assert.Equal(4, await f.Context.ArticleVersions.AsNoTracking().CountAsync());
        Assert.Contains(await f.Context.ArticleVersions.AsNoTracking().ToArrayAsync(),
            version => version.VersionId == original.VersionId);
    }

    [Fact]
    public async Task Publishing_approved_article_keeps_source_draft_approved_and_cannot_publish_it_twice()
    {
        await using var f = await Fixture.CreateApprovedAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);
        f.Current.UserId = f.PublisherId;
        var commentId = Guid.NewGuid();
        var mediaId = Guid.NewGuid();
        var mediaReferenceId = Guid.NewGuid();
        f.Context.ArticleComments.Add(new ArticleComment
        {
            CommentId = commentId,
            ArticleIdFk = f.ArticleId,
            Body = "Keep this review comment",
            CurrentDraftIdFk = f.DraftId,
            OriginDraftIdFk = f.DraftId,
            AnchorStatus = CommentAnchorStatuses.Attached,
            Status = CommentThreadStatuses.Open,
            CreatedByFk = f.AuthorId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            RowVersion = Guid.NewGuid().ToByteArray()
        });
        f.Context.MediaFiles.Add(new MediaFile
        {
            MediaId = mediaId,
            OriginalFileName = "publish-regression.png",
            StoredFileName = "publish-regression.png",
            MimeType = "image/png",
            FileSizeBytes = 42,
            StoragePath = "media/publish-regression.png",
            Status = MediaStatuses.Active,
            UploadedByFk = f.AuthorId,
            UploadedAt = DateTime.UtcNow
        });
        f.Context.MediaReferences.Add(new MediaReference
        {
            ReferenceId = mediaReferenceId,
            MediaIdFk = mediaId,
            ArticleIdFk = f.ArticleId,
            ReferenceEntityType = MediaReferenceTypes.Draft,
            ReferenceEntityId = f.DraftId
        });
        await f.Context.SaveChangesAsync();
        f.Context.ChangeTracker.Clear();

        var published = await f.Service.PublishAsync(
            f.ArticleId, new(f.RowVersion, "Publish once"), default);

        f.Context.ChangeTracker.Clear();
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        var draft = await f.Context.ArticleDrafts.AsNoTracking().SingleAsync();
        var version = await f.Context.ArticleVersions.AsNoTracking()
            .SingleAsync(item => item.VersionId == published.PublishedVersionId);
        Assert.Equal(ArticleStatuses.Published, published.Status);
        Assert.Equal(ArticleStatuses.Published, article.Status);
        Assert.Equal(ArticleStatuses.Approved, draft.Status);
        Assert.Equal(draft.DraftId, article.CurrentDraftIdFk);
        Assert.Equal(version.VersionId, article.LastPublishedVersionIdFk);
        Assert.Equal(draft.DraftId, version.SourceDraftIdFk);
        Assert.False((await f.Service.GetPermissionsAsync(f.ArticleId, default)).CanPublish);
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.PublishAsync(
            f.ArticleId, new(published.RowVersion, "Duplicate publish"), default));
        Assert.Equal(2, await f.Context.ArticleVersions.AsNoTracking().CountAsync());
        Assert.Single(await f.Context.SearchIndexJobs.AsNoTracking().ToListAsync());
        Assert.True(await f.Context.ArticleComments.AsNoTracking()
            .AnyAsync(comment => comment.CommentId == commentId));
        Assert.True(await f.Context.MediaReferences.AsNoTracking()
            .AnyAsync(reference => reference.ReferenceId == mediaReferenceId));
    }

    [Fact]
    public async Task Rejection_returns_the_article_for_changes_and_notifies_the_author()
    {
        await using var f = await Fixture.CreateAsync(ArticleStatuses.InReview);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Current.UserId = f.ReviewerId;

        var rejected = await f.Service.RejectAsync(f.ArticleId,
            new(f.RowVersion, "The evidence is incomplete."), default);

        Assert.Equal(ArticleStatuses.ChangesRequested, rejected.Status);
        var notification = await f.Context.Notifications.AsNoTracking().SingleAsync();
        Assert.Equal(f.AuthorId, notification.UserIdFk);
        Assert.Equal(NotificationTypes.ArticleRejected, notification.Type);
        Assert.Contains("evidence is incomplete", notification.Body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Invalid_transition_conflicts_before_storage_is_read()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);
        f.Current.UserId = f.PublisherId;

        await Assert.ThrowsAsync<ConflictException>(() => f.Service.PublishAsync(
            f.ArticleId, new(f.RowVersion), default));

        Assert.Empty(f.Storage.DownloadedPaths);
        Assert.Empty(await f.Context.ArticleReviewEvents.ToListAsync());
        Assert.Empty(await f.Context.ArticleAuditLogs.ToListAsync());
    }

    [Fact]
    public async Task Submission_requires_the_author_and_submit_permission()
    {
        await using var f = await Fixture.CreateAsync();

        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.SubmitAsync(
            f.ArticleId, new(f.RowVersion), default));
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesSubmitForReview);
        f.Current.UserId = f.ReviewerId;
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.SubmitAsync(
            f.ArticleId, new(f.RowVersion), default));
    }

    [Fact]
    public async Task Reviewer_cannot_approve_own_article()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesSubmitForReview, PermissionCodes.ArticlesReview);
        var submitted = await f.Service.SubmitAsync(f.ArticleId, new(f.RowVersion), default);
        var started = await f.Service.StartReviewAsync(f.ArticleId,
            new(submitted.RowVersion), default);

        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.ApproveAsync(
            f.ArticleId, new(started.RowVersion), default));
        Assert.Equal(ArticleStatuses.InReview,
            (await f.Context.ArticleDrafts.AsNoTracking().SingleAsync()).Status);
    }

    [Fact]
    public async Task Submitted_article_is_reviewable_without_a_separate_start_transition()
    {
        await using var f = await Fixture.CreateAsync(ArticleStatuses.SubmittedForReview);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Current.UserId = f.ReviewerId;

        var permissions = await f.Service.GetPermissionsAsync(f.ArticleId, default);

        Assert.True(permissions.CanReview);
        Assert.True(permissions.CanRequestChanges);
        Assert.True(permissions.CanApprove);
        var approved = await f.Service.ApproveAsync(f.ArticleId,
            new(f.RowVersion, "Ready to publish"), default);
        Assert.Equal(ArticleStatuses.Approved, approved.Status);
    }

    [Fact]
    public async Task Admin_can_approve_own_article_and_publish_it()
    {
        await using var f = await Fixture.CreateAsync(ArticleStatuses.InReview);
        await f.MarkAdminAsync(f.AuthorId);

        var reviewPermissions = await f.Service.GetPermissionsAsync(f.ArticleId, default);
        Assert.True(reviewPermissions.CanRequestChanges);
        Assert.True(reviewPermissions.CanApprove);

        var approved = await f.Service.ApproveAsync(f.ArticleId,
            new(f.RowVersion, "Admin approval"), default);
        var publishPermissions = await f.Service.GetPermissionsAsync(f.ArticleId, default);
        Assert.True(publishPermissions.CanPublish);

        var published = await f.Service.PublishAsync(f.ArticleId,
            new(approved.RowVersion, "Admin publish"), default);
        Assert.Equal(ArticleStatuses.Published, published.Status);
    }

    [Fact]
    public async Task Reviewer_can_publish_only_when_publish_permission_is_explicitly_granted()
    {
        await using var f = await Fixture.CreateAsync(ArticleStatuses.Approved);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Current.UserId = f.ReviewerId;

        Assert.False((await f.Service.GetPermissionsAsync(f.ArticleId, default)).CanPublish);
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.PublishAsync(
            f.ArticleId, new(f.RowVersion), default));

        f.Grant(f.ReviewerId, PermissionCodes.ArticlesPublish);
        Assert.True((await f.Service.GetPermissionsAsync(f.ArticleId, default)).CanPublish);
        var published = await f.Service.PublishAsync(f.ArticleId, new(f.RowVersion), default);
        Assert.Equal(ArticleStatuses.Published, published.Status);
    }

    [Fact]
    public async Task Changes_requested_restores_edit_access_only_to_an_authorized_editor()
    {
        await using var f = await Fixture.CreateAsync(ArticleStatuses.ChangesRequested);
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesEditOwnDraft);

        var authorDraft = await f.CreateDraftService().GetAsync(f.ArticleId, default);
        Assert.True(authorDraft.CanEdit);

        f.Current.UserId = f.ReviewerId;
        var unauthorizedDraft = await f.CreateDraftService().GetAsync(f.ArticleId, default);
        Assert.False(unauthorizedDraft.CanEdit);
    }

    [Fact]
    public async Task Request_changes_requires_a_reason_and_does_not_mutate_state_without_one()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesSubmitForReview);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        var submitted = await f.Service.SubmitAsync(f.ArticleId, new(f.RowVersion), default);
        f.Current.UserId = f.ReviewerId;
        var started = await f.Service.StartReviewAsync(f.ArticleId,
            new(submitted.RowVersion), default);

        await Assert.ThrowsAsync<BusinessRuleException>(() => f.Service.RequestChangesAsync(
            f.ArticleId, new(started.RowVersion, "  "), default));

        Assert.Equal(ArticleStatuses.InReview,
            (await f.Context.ArticleDrafts.AsNoTracking().SingleAsync()).Status);
    }

    [Fact]
    public async Task Stale_row_version_and_locked_draft_both_conflict()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesSubmitForReview);
        var stale = f.RowVersion.ToArray();
        var replacement = Guid.NewGuid().ToByteArray();
        await f.Context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE ARTICLE_DRAFTS SET RowVersion = {replacement} WHERE DraftID = {f.DraftId}");
        f.Context.ChangeTracker.Clear();

        await Assert.ThrowsAsync<ConcurrencyConflictException>(() => f.Service.SubmitAsync(
            f.ArticleId, new(stale), default));

        await f.Context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE ARTICLE_DRAFTS SET IsLocked = {true}, LockedBy_FK = {f.AuthorId} WHERE DraftID = {f.DraftId}");
        f.Context.ChangeTracker.Clear();
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.SubmitAsync(
            f.ArticleId, new(replacement), default));
    }

    [Fact]
    public async Task Publish_snapshot_storage_failure_does_not_change_the_live_version()
    {
        await using var f = await Fixture.CreateApprovedAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);
        f.Current.UserId = f.PublisherId;
        var uploadsBefore = f.Storage.UploadedPaths.Count;
        f.Storage.FailUploadNumber = 1;

        await Assert.ThrowsAsync<ExternalServiceException>(() =>
            f.Service.PublishAsync(f.ArticleId, new(f.RowVersion), default));

        f.Context.ChangeTracker.Clear();
        Assert.Equal(ArticleStatuses.Approved,
            (await f.Context.Articles.AsNoTracking().SingleAsync()).Status);
        Assert.Single(await f.Context.ArticleVersions.AsNoTracking().ToListAsync());
        Assert.Null((await f.Context.Articles.AsNoTracking().SingleAsync()).LastPublishedVersionIdFk);
        Assert.True(f.Storage.UploadedPaths.Count >= uploadsBefore);
    }

    [Fact]
    public async Task Restore_copies_version_into_new_editable_draft_and_preserves_published_version()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId, PermissionCodes.VersionsRestore);
        f.Current.UserId = f.PublisherId;
        var publishedArticle = await f.Context.Articles.AsNoTracking().SingleAsync();
        var publishedVersion = await f.PublishedVersionAsync();
        var publishedPath = publishedVersion.ContentJsonStoragePath;

        var restored = await f.Service.RestoreAsync(f.ArticleId, publishedVersion.VersionId,
            new(f.RowVersion), default);

        Assert.Equal(ArticleStatuses.Published, restored.Status);
        Assert.NotEqual(f.DraftId, restored.DraftId);
        f.Context.ChangeTracker.Clear();
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(publishedArticle.LastPublishedVersionIdFk, article.LastPublishedVersionIdFk);
        Assert.Equal(restored.DraftId, article.CurrentDraftIdFk);
        var newDraft = await f.Context.ArticleDrafts.AsNoTracking()
            .SingleAsync(draft => draft.DraftId == restored.DraftId);
        Assert.NotEqual(publishedPath, newDraft.ContentJsonStoragePath);
        Assert.Equal(f.Storage.Get(publishedPath), f.Storage.Get(newDraft.ContentJsonStoragePath));
        Assert.Contains(publishedPath, f.Storage.StoredPaths);
        Assert.Equal(ArticleAuditActions.Restored,
            (await f.Context.ArticleAuditLogs.OrderByDescending(log => log.CreatedAt).FirstAsync()).ActionType);

        var immutablePublishedBytes = f.Storage.Get(publishedPath).ToArray();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesEditAnyDraft);
        var draftService = f.CreateDraftService();
        var locked = await draftService.AcquireLockAsync(f.ArticleId, restored.RowVersion, default);
        using var changedDocument = JsonDocument.Parse(
            """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"newer draft"}]}]}""");
        await draftService.SaveContentAsync(f.ArticleId,
            new(changedDocument.RootElement.Clone(), "<p>newer draft</p>", "newer draft",
                locked.Draft.RowVersion), default);

        f.Context.ChangeTracker.Clear();
        var afterDraftSave = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleStatuses.Published, afterDraftSave.Status);
        Assert.Equal(publishedVersion.VersionId, afterDraftSave.LastPublishedVersionIdFk);
        Assert.Single(await f.Context.SearchIndexJobs.AsNoTracking().ToArrayAsync());
        Assert.Equal(immutablePublishedBytes, f.Storage.Get(publishedPath));
        Assert.Contains(publishedPath, f.Storage.StoredPaths);
        Assert.DoesNotContain(publishedPath, f.Storage.DeletedPaths);
    }

    [Fact]
    public async Task Published_article_source_draft_cannot_be_locked_or_edited_until_a_new_draft_is_created()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesEditAnyDraft);
        f.Current.UserId = f.PublisherId;
        var drafts = f.CreateDraftService();

        var loaded = await drafts.GetAsync(f.ArticleId, default);

        Assert.False(loaded.CanEdit);
        await Assert.ThrowsAsync<ConflictException>(() =>
            drafts.AcquireLockAsync(f.ArticleId, f.RowVersion, default));
    }

    [Fact]
    public async Task Restore_storage_failure_keeps_published_pointer_and_current_draft()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId, PermissionCodes.VersionsRestore);
        f.Current.UserId = f.PublisherId;
        var version = await f.PublishedVersionAsync();
        f.Storage.FailDownloadPath = version.ContentJsonStoragePath;

        await Assert.ThrowsAsync<ExternalServiceException>(() => f.Service.RestoreAsync(
            f.ArticleId, version.VersionId, new(f.RowVersion), default));

        f.Context.ChangeTracker.Clear();
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(f.DraftId, article.CurrentDraftIdFk);
        Assert.Equal(version.VersionId, article.LastPublishedVersionIdFk);
        Assert.Single(await f.Context.ArticleDrafts.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Restore_can_replace_an_unlocked_editable_draft_without_changing_published_version()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId, PermissionCodes.VersionsRestore);
        f.Current.UserId = f.PublisherId;
        var version = await f.PublishedVersionAsync();
        var firstRestore = await f.Service.RestoreAsync(
            f.ArticleId, version.VersionId, new(f.RowVersion), default);

        var secondRestore = await f.Service.RestoreAsync(
            f.ArticleId, version.VersionId, new(firstRestore.RowVersion), default);

        Assert.NotEqual(firstRestore.DraftId, secondRestore.DraftId);
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(version.VersionId, article.LastPublishedVersionIdFk);
        Assert.Equal(secondRestore.DraftId, article.CurrentDraftIdFk);
        var drafts = await f.Context.ArticleDrafts.AsNoTracking()
            .OrderBy(draft => draft.DraftNumber).ToArrayAsync();
        Assert.Equal([1, 2, 3], drafts.Select(draft => draft.DraftNumber).ToArray());
        Assert.Equal(ArticleStatuses.Published, article.Status);
    }

    [Fact]
    public async Task Admin_override_requires_both_permissions_and_records_override_metadata()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesEditAnyDraft);
        f.Current.UserId = f.ReviewerId;
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.OverrideAsync(f.ArticleId,
            new(ArticleStatuses.Approved, "Emergency correction", f.RowVersion), default));

        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        var overridden = await f.Service.OverrideAsync(f.ArticleId,
            new(ArticleStatuses.Approved, "Emergency correction", f.RowVersion), default);

        Assert.Equal(ArticleStatuses.Approved, overridden.Status);
        var review = await f.Context.ArticleReviewEvents.AsNoTracking().SingleAsync();
        Assert.Equal(ReviewActions.Override, review.Action);
        var audit = await f.Context.ArticleAuditLogs.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleAuditActions.WorkflowOverridden, audit.ActionType);
        Assert.Contains("\"isOverride\":true", audit.MetaDataJson);
    }

    [Fact]
    public async Task Archive_sets_archived_status_and_keeps_article_in_internal_search()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesDelete);
        f.Current.UserId = f.PublisherId;

        await f.Service.ArchiveAsync(f.ArticleId, f.RowVersion, default);

        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleStatuses.Archived, article.Status);
        Assert.Null(article.DeletedAt);
        Assert.Equal(ArticleStatuses.Draft,
            (await f.Context.ArticleDrafts.AsNoTracking().SingleAsync()).Status);
        var audit = await f.Context.ArticleAuditLogs.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleAuditActions.Archived, audit.ActionType);
        Assert.Contains("\"newState\":\"Archived\"", audit.MetaDataJson);
        var job = await f.Context.SearchIndexJobs.AsNoTracking().SingleAsync();
        Assert.Equal(SearchIndexJobTypes.Upsert, job.JobType);
        Assert.Null(job.VersionIdFk);
    }

    [Fact]
    public async Task Archived_article_keeps_its_current_draft_and_lifecycle_reads_remain_available()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId,
            PermissionCodes.ArticlesDelete,
            PermissionCodes.ArticlesEditAnyDraft,
            PermissionCodes.ArticlesPublish,
            PermissionCodes.VersionsView);
        var before = await f.Context.Articles.AsNoTracking().SingleAsync();

        await f.Service.ArchiveAsync(f.ArticleId, f.RowVersion, default);

        var after = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(before.CurrentDraftIdFk, after.CurrentDraftIdFk);
        Assert.Equal(before.LastPublishedVersionIdFk, after.LastPublishedVersionIdFk);
        var draft = await f.CreateDraftService().GetAsync(f.ArticleId, default);
        Assert.Equal(f.DraftId, draft.Draft.DraftId);
        Assert.Equal(ArticleStatuses.Archived, draft.Draft.ArticleStatus);
        Assert.Equal(ArticleStatuses.Approved, draft.Draft.Status);
        Assert.False(draft.CanEdit);

        var permissions = await f.Service.GetPermissionsAsync(f.ArticleId, default);
        Assert.True(permissions.CanViewVersionHistory);
        Assert.False(permissions.CanEdit);
        Assert.False(permissions.CanPublish);
        Assert.False(permissions.CanDelete);
        Assert.False(permissions.CanOverrideWorkflow);
        Assert.Equal(2, (await f.Service.GetVersionsAsync(f.ArticleId, 1, 20, default)).Items.Count);
        Assert.Equal(before.LastPublishedVersionIdFk,
            (await f.Service.GetPublishedVersionAsync(f.ArticleId, default)).Version.VersionId);
        Assert.Contains(await f.Service.GetReviewHistoryAsync(f.ArticleId, default),
            review => review.Action == ReviewActions.Archive);
    }

    [Fact]
    public async Task Approved_article_can_be_archived_unarchived_and_published_without_repairing_draft_links()
    {
        await using var f = await Fixture.CreateApprovedAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesDelete, PermissionCodes.ArticlesPublish);
        f.Current.UserId = f.PublisherId;
        var currentDraftId = (await f.Context.Articles.AsNoTracking().SingleAsync()).CurrentDraftIdFk;

        await f.Service.ArchiveAsync(f.ArticleId, f.RowVersion, default);
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.PublishAsync(
            f.ArticleId, new(f.RowVersion, "Cannot publish while archived"), default));
        var unarchived = await f.Service.UnarchiveAsync(f.ArticleId, default);
        var published = await f.Service.PublishAsync(
            f.ArticleId, new(unarchived.RowVersion, "Publish after restore"), default);

        Assert.Equal(ArticleStatuses.Published, published.Status);
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(currentDraftId, article.CurrentDraftIdFk);
        Assert.Equal(published.PublishedVersionId, article.LastPublishedVersionIdFk);
        Assert.Equal(2, await f.Context.ArticleVersions.AsNoTracking().CountAsync());
    }

    [Fact]
    public async Task Unarchive_restores_workflow_state_and_published_search_document_without_data_loss()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesDelete);
        var publishedVersionId = (await f.Context.Articles.AsNoTracking().SingleAsync())
            .LastPublishedVersionIdFk;
        var commentId = Guid.NewGuid();
        var mediaId = Guid.NewGuid();
        f.Context.ArticleComments.Add(new ArticleComment
        {
            CommentId = commentId,
            ArticleIdFk = f.ArticleId,
            Body = "Preserve this comment",
            CurrentDraftIdFk = f.DraftId,
            OriginDraftIdFk = f.DraftId,
            AnchorStatus = CommentAnchorStatuses.Attached,
            Status = CommentThreadStatuses.Open,
            CreatedByFk = f.PublisherId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            RowVersion = Guid.NewGuid().ToByteArray()
        });
        f.Context.MediaFiles.Add(new MediaFile
        {
            MediaId = mediaId,
            OriginalFileName = "preserved.png",
            StoredFileName = "preserved.png",
            MimeType = "image/png",
            FileSizeBytes = 42,
            StoragePath = "media/preserved.png",
            Status = MediaStatuses.Active,
            UploadedByFk = f.PublisherId,
            UploadedAt = DateTime.UtcNow
        });
        f.Context.MediaReferences.Add(new MediaReference
        {
            ReferenceId = Guid.NewGuid(),
            MediaIdFk = mediaId,
            ArticleIdFk = f.ArticleId,
            ReferenceEntityType = MediaReferenceTypes.Draft,
            ReferenceEntityId = f.DraftId
        });
        await f.Context.SaveChangesAsync();
        var draftCount = await f.Context.ArticleDrafts.CountAsync();
        var versionCount = await f.Context.ArticleVersions.CountAsync();
        var commentCount = await f.Context.ArticleComments.CountAsync();
        var mediaReferenceCount = await f.Context.MediaReferences.CountAsync();

        await f.Service.ArchiveAsync(f.ArticleId, f.RowVersion, default);
        Assert.Equal(publishedVersionId,
            (await f.Service.GetPublishedVersionAsync(f.ArticleId, default)).Version.VersionId);
        var restored = await f.Service.UnarchiveAsync(f.ArticleId, default);

        Assert.Equal(ArticleStatuses.Published, restored.Status);
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleStatuses.Published, article.Status);
        Assert.Equal(publishedVersionId, article.LastPublishedVersionIdFk);
        Assert.Equal(draftCount, await f.Context.ArticleDrafts.CountAsync());
        Assert.Equal(versionCount, await f.Context.ArticleVersions.CountAsync());
        Assert.Equal(commentCount, await f.Context.ArticleComments.CountAsync());
        Assert.Equal(mediaReferenceCount, await f.Context.MediaReferences.CountAsync());
        Assert.Equal(
            [ReviewActions.Archive, ReviewActions.Unarchive],
            await f.Context.ArticleReviewEvents.AsNoTracking()
                .Where(value => value.Action == ReviewActions.Archive || value.Action == ReviewActions.Unarchive)
                .OrderBy(value => value.CreatedAt)
                .Select(value => value.Action)
                .ToArrayAsync());
        Assert.True(await f.Context.ArticleComments.AnyAsync(comment => comment.CommentId == commentId));
        Assert.True(await f.Context.MediaReferences.AnyAsync(reference => reference.MediaIdFk == mediaId));
        Assert.Equal(
            [SearchIndexJobTypes.Upsert],
            await f.Context.SearchIndexJobs.AsNoTracking()
                .OrderBy(job => job.CreatedAt)
                .ThenBy(job => job.SearchJobId)
                .Select(job => job.JobType)
                .ToArrayAsync());
        Assert.Contains(await f.Context.ArticleAuditLogs.AsNoTracking().ToArrayAsync(),
            audit => audit.ActionType == ArticleAuditActions.Unarchived &&
                     audit.MetaDataJson!.Contains("\"newState\":\"Published\""));
    }

    [Fact]
    public async Task Version_rows_are_append_only()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var publishedVersionId = (await f.Context.Articles.AsNoTracking().SingleAsync()).LastPublishedVersionIdFk;
        var version = await f.Context.ArticleVersions.SingleAsync(item => item.VersionId == publishedVersionId);
        version.SnapshotReason = ArticleSnapshotReasons.Approved;

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => f.Context.SaveChangesAsync());

        Assert.Contains("immutable", exception.Message, StringComparison.OrdinalIgnoreCase);
        f.Context.ChangeTracker.Clear();
        var unchanged = await f.Context.ArticleVersions.AsNoTracking()
            .SingleAsync(item => item.VersionId == version.VersionId);
        Assert.Equal(ArticleSnapshotReasons.Published, unchanged.SnapshotReason);
    }

    [Fact]
    public async Task Version_history_requires_permission_and_is_stably_paginated_with_metadata()
    {
        await using var f = await Fixture.CreateAsync();
        await f.AddVersionAsync(1, ArticleSnapshotReasons.SubmittedForReview, "first");
        await f.AddVersionAsync(2, ArticleSnapshotReasons.Approved, "second");
        await f.AddVersionAsync(3, ArticleSnapshotReasons.Published, "third", isPublished: true);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            f.Service.GetVersionsAsync(f.ArticleId, 1, 2, default));
        f.Current.IsAuthenticated = false;
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            f.Service.GetVersionsAsync(f.ArticleId, 1, 2, default));
        f.Current.IsAuthenticated = true;
        f.Grant(f.AuthorId, PermissionCodes.VersionsView);

        var firstPage = await f.Service.GetVersionsAsync(f.ArticleId, 1, 2, default);
        var secondPage = await f.Service.GetVersionsAsync(f.ArticleId, 2, 2, default);

        Assert.Equal(3, firstPage.TotalCount);
        Assert.Equal([3, 2], firstPage.Items.Select(version => version.VersionNumber).ToArray());
        Assert.Equal([1], secondPage.Items.Select(version => version.VersionNumber).ToArray());
        Assert.Equal(f.DraftId, firstPage.Items[0].SourceDraftId);
        Assert.Equal(1, firstPage.Items[0].SourceDraftNumber);
        Assert.True(firstPage.Items[0].IsPublished);
        Assert.Equal(ArticleSnapshotReasons.Published, firstPage.Items[0].SnapshotReason);
    }

    [Fact]
    public async Task Version_details_return_readable_content_and_report_missing_storage()
    {
        await using var f = await Fixture.CreateAsync();
        var version = await f.AddVersionAsync(
            1,
            ArticleSnapshotReasons.Approved,
            "Readable version text",
            renderedHtml: "<p>Readable version text</p>");
        f.Grant(f.AuthorId, PermissionCodes.VersionsView);

        var details = await f.Service.GetVersionDetailsAsync(
            f.ArticleId, version.VersionId, default);

        Assert.Equal("Readable version text", details.PlainText);
        Assert.Equal("<p>Readable version text</p>", details.RenderedHtml);
        f.Storage.FailDownloadPath = version.ContentJsonStoragePath;
        await Assert.ThrowsAsync<ExternalServiceException>(() =>
            f.Service.GetVersionDetailsAsync(f.ArticleId, version.VersionId, default));
    }

    [Fact]
    public async Task Comparison_returns_structured_added_removed_and_changed_blocks()
    {
        await using var f = await Fixture.CreateAsync();
        var before = await f.AddVersionDocumentAsync(
            1,
            ArticleSnapshotReasons.SubmittedForReview,
            """
            {"type":"doc","content":[
              {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Setup"}]},
              {"type":"paragraph","content":[{"type":"text","text":"Install the old package"}]},
              {"type":"paragraph","content":[{"type":"text","text":"Remove me"}]}
            ]}
            """);
        var after = await f.AddVersionDocumentAsync(
            2,
            ArticleSnapshotReasons.Approved,
            """
            {"type":"doc","content":[
              {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Setup"}]},
              {"type":"paragraph","content":[{"type":"text","text":"Install the new package"}]},
              {"type":"paragraph","content":[{"type":"text","text":"Added guidance"}]},
              {"type":"paragraph","content":[{"type":"text","text":"Another addition"}]}
            ]}
            """);
        f.Grant(f.AuthorId, PermissionCodes.VersionsView);

        var comparison = await f.Service.CompareVersionsAsync(
            f.ArticleId, before.VersionId, after.VersionId, default);

        Assert.Equal(2, comparison.ChangedCount);
        Assert.Equal(1, comparison.AddedCount);
        Assert.Equal(0, comparison.RemovedCount);
        Assert.Equal(1, comparison.UnchangedCount);
        var changed = comparison.Changes.Single(change =>
            change.ChangeType == "Changed" && change.BeforeText == "Install the old package");
        Assert.Equal("Changed", changed.ChangeType);
        Assert.Equal("Install the old package", changed.BeforeText);
        Assert.Equal("Install the new package", changed.AfterText);
        Assert.Contains(changed.Segments, segment =>
            segment.ChangeType == "Removed" && segment.Text.Contains("old"));
        Assert.Contains(changed.Segments, segment =>
            segment.ChangeType == "Added" && segment.Text.Contains("new"));
        Assert.Contains(comparison.Changes, change =>
            change.ChangeType == "Unchanged" && change.BlockLabel == "Heading 2");

        var reverseSelection = await f.Service.CompareVersionsAsync(
            f.ArticleId, after.VersionId, before.VersionId, default);
        Assert.Equal(before.VersionId, reverseSelection.BaseVersion.VersionId);
        Assert.Equal(after.VersionId, reverseSelection.TargetVersion.VersionId);
    }

    [Fact]
    public async Task Comparison_preserves_labels_for_structured_tiptap_blocks()
    {
        await using var f = await Fixture.CreateAsync();
        var before = await f.AddVersionDocumentAsync(1, ArticleSnapshotReasons.SubmittedForReview,
            """
            {"type":"doc","content":[
              {"type":"tabs","content":[{"type":"tabItem","attrs":{"label":"Overview"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Old tab text"}]}]}]},
              {"type":"accordion","content":[{"type":"accordionItem","attrs":{"title":"FAQ"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Old answer"}]}]}]},
              {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Name"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Old value"}]}]}]}]},
              {"type":"callout","attrs":{"variant":"warning"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Keep this warning"}]}]}
            ]}
            """);
        var after = await f.AddVersionDocumentAsync(2, ArticleSnapshotReasons.Published,
            """
            {"type":"doc","content":[
              {"type":"tabs","content":[{"type":"tabItem","attrs":{"label":"Overview"},"content":[{"type":"paragraph","content":[{"type":"text","text":"New tab text"}]}]}]},
              {"type":"accordion","content":[{"type":"accordionItem","attrs":{"title":"FAQ"},"content":[{"type":"paragraph","content":[{"type":"text","text":"New answer"}]}]}]},
              {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Name"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"New value"}]}]}]}]},
              {"type":"callout","attrs":{"variant":"warning"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Keep this warning"}]}]}
            ]}
            """);
        f.Grant(f.AuthorId, PermissionCodes.VersionsView);

        var comparison = await f.Service.CompareVersionsAsync(
            f.ArticleId, before.VersionId, after.VersionId, default);

        Assert.Contains(comparison.Changes, change => change.BlockLabel == "Tab: Overview");
        Assert.Contains(comparison.Changes, change => change.BlockLabel == "Accordion: FAQ");
        Assert.Contains(comparison.Changes, change => change.BlockLabel == "Table row" &&
            change.AfterText == "Name | New value");
        Assert.Contains(comparison.Changes, change => change.BlockLabel == "Warning callout" &&
            change.ChangeType == "Unchanged");
    }

    [Fact]
    public async Task Comparison_rejects_invalid_pairs_permissions_and_storage_failures()
    {
        await using var f = await Fixture.CreateAsync();
        var first = await f.AddVersionAsync(1, ArticleSnapshotReasons.Approved, "first");
        var second = await f.AddVersionAsync(2, ArticleSnapshotReasons.Published, "second");

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            f.Service.CompareVersionsAsync(f.ArticleId, first.VersionId, second.VersionId, default));
        f.Grant(f.AuthorId, PermissionCodes.VersionsView);
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            f.Service.CompareVersionsAsync(f.ArticleId, first.VersionId, first.VersionId, default));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            f.Service.CompareVersionsAsync(f.ArticleId, first.VersionId, Guid.NewGuid(), default));
        f.Storage.FailDownloadPath = second.ContentJsonStoragePath;
        await Assert.ThrowsAsync<ExternalServiceException>(() =>
            f.Service.CompareVersionsAsync(f.ArticleId, first.VersionId, second.VersionId, default));
    }

    [Fact]
    public async Task Permission_queries_run_sequentially_and_preserve_granted_permissions()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId,
            PermissionCodes.ArticlesEditOwnDraft,
            PermissionCodes.ArticlesSubmitForReview,
            PermissionCodes.CommentsCreate);
        f.TrackPermissionCheckConcurrency();

        var result = await f.Service.GetPermissionsAsync(f.ArticleId, default);

        Assert.Equal(1, f.MaxConcurrentPermissionChecks);
        Assert.True(result.CanEdit);
        Assert.True(result.CanSubmitForReview);
        Assert.True(result.CanLock);
        Assert.True(result.CanComment);
        Assert.False(result.CanReview);
        Assert.False(result.CanPublish);
    }

    [Fact]
    public async Task Restore_requires_restore_permission_and_current_row_version()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var version = await f.PublishedVersionAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.RestoreAsync(
            f.ArticleId, version.VersionId, new(f.RowVersion), default));

        f.Grant(f.PublisherId, PermissionCodes.VersionsRestore);
        var replacement = Guid.NewGuid().ToByteArray();
        await f.Context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE ARTICLE_DRAFTS SET RowVersion = {replacement} WHERE DraftID = {f.DraftId}");
        f.Context.ChangeTracker.Clear();

        await Assert.ThrowsAsync<ConcurrencyConflictException>(() => f.Service.RestoreAsync(
            f.ArticleId, version.VersionId, new(f.RowVersion), default));
        Assert.DoesNotContain(f.Storage.UploadedPaths,
            path => path.Contains("/restored/", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Publishing_source_marks_only_linked_older_translations_out_of_date_and_preserves_their_versions()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var translated = await f.AddLinkedTranslationAsync(ArticleStatuses.Published, true);
        var translatedVersionCount = await f.Context.ArticleVersions.CountAsync(x => x.ArticleIdFk == translated.ArticleId);
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft, PermissionCodes.ArticlesSubmitForReview,
            PermissionCodes.VersionsRestore);
        f.Grant(f.ReviewerId, PermissionCodes.ArticlesReview);
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);

        var original = await f.PublishedVersionAsync();
        f.Current.UserId = f.AuthorId;
        var restored = await f.Service.RestoreAsync(f.ArticleId, original.VersionId, new(f.RowVersion), default);
        var submitted = await f.Service.SubmitAsync(f.ArticleId, new(restored.RowVersion), default);
        f.Current.UserId = f.ReviewerId;
        var approved = await f.Service.ApproveAsync(f.ArticleId, new(submitted.RowVersion), default);
        f.Current.UserId = f.PublisherId;
        var republished = await f.Service.PublishAsync(f.ArticleId, new(approved.RowVersion), default);

        var metadata = await f.Context.ArticleTranslationMetadata.AsNoTracking()
            .SingleAsync(x => x.ArticleId == translated.ArticleId);
        Assert.Equal(ArticleTranslationStatuses.OutOfDate, metadata.TranslationStatus);
        Assert.Equal(original.VersionId, metadata.SourceVersionId);
        Assert.Equal(original.VersionNumber, metadata.SourceVersionNumber);
        Assert.Equal(translated.PublishedVersionId, (await f.Context.Articles.AsNoTracking()
            .SingleAsync(x => x.ArticleId == translated.ArticleId)).LastPublishedVersionIdFk);
        Assert.Equal(translatedVersionCount, await f.Context.ArticleVersions.CountAsync(x => x.ArticleIdFk == translated.ArticleId));
        var displayed = (await new ArticleTranslationRepository(f.Context).GetAllAsync(f.ArticleId, default))
            .Single(x => x.ArticleId == translated.ArticleId);
        Assert.Equal(original.VersionNumber, displayed.SourceVersionNumber);
        Assert.Equal(republished.PublishedVersionNumber, displayed.CurrentSourceVersionNumber);
        Assert.False(displayed.IsCurrent);
        var audit = await f.Context.ArticleAuditLogs.AsNoTracking().SingleAsync(x =>
            x.ArticleIdFk == translated.ArticleId && x.ActionType == ArticleAuditActions.TranslationMarkedOutOfDate);
        using var auditMetadata = JsonDocument.Parse(audit.MetaDataJson!);
        Assert.Equal(republished.PublishedVersionId, auditMetadata.RootElement.GetProperty("currentSourceVersionId").GetGuid());
    }

    [Fact]
    public async Task Saving_source_drafts_does_not_mark_translations_out_of_date()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var translated = await f.AddLinkedTranslationAsync(ArticleStatuses.Approved, false);
        await f.UpdateDraftContentAsync("Unpublished source edit");

        Assert.Equal(ArticleTranslationStatuses.Verified, (await f.Context.ArticleTranslationMetadata.AsNoTracking()
            .SingleAsync(x => x.ArticleId == translated.ArticleId)).TranslationStatus);
        Assert.Empty(await f.Context.ArticleAuditLogs.AsNoTracking().Where(x =>
            x.ActionType == ArticleAuditActions.TranslationMarkedOutOfDate).ToArrayAsync());
    }

    [Fact]
    public async Task Publishing_a_translated_article_does_not_mark_its_current_translation_out_of_date()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var translated = await f.AddLinkedTranslationAsync(ArticleStatuses.Approved, false);
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);
        f.Current.UserId = f.PublisherId;

        await f.Service.PublishAsync(translated.ArticleId, new(translated.RowVersion), default);

        Assert.Equal(ArticleTranslationStatuses.Verified, (await f.Context.ArticleTranslationMetadata.AsNoTracking()
            .SingleAsync(x => x.ArticleId == translated.ArticleId)).TranslationStatus);
        Assert.Empty(await f.Context.ArticleAuditLogs.AsNoTracking().Where(x =>
            x.ArticleIdFk == translated.ArticleId && x.ActionType == ArticleAuditActions.TranslationMarkedOutOfDate).ToArrayAsync());
    }

    [Fact]
    public async Task Localization_sync_creates_a_missing_unpublished_copy_atomically()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var now = DateTime.UtcNow;
        f.Context.KbLanguages.Add(new KbLanguage
        {
            LanguageId = Guid.NewGuid(), LocaleCode = "fr", DisplayName = "French", NativeName = "Français",
            IsEnabled = true, SortOrder = 2, CreatedAt = now, UpdatedAt = now
        });
        await f.Context.SaveChangesAsync();
        var repository = new LocalizationSynchronizationRepository(f.Context);
        var plan = await repository.GetPlanAsync(f.ArticleId, ["fr"], default);
        var target = Assert.Single(plan.Targets);
        Assert.Equal(LocalizationSyncStates.Missing, target.State);

        var result = await repository.CommitAsync(new(plan.Source, "fr", null, null, null,
            LocalizationSyncOperations.CreateCopy, "Lifecycle source", "sync/fr/content.json", "copy-hash", 42,
            [], ArticleTranslationMethods.Copied, ArticleTranslationStatuses.NeedsTranslation, null, 0,
            f.AuthorId, now), default);

        var article = await f.Context.Articles.AsNoTracking().SingleAsync(x => x.ArticleId == result.TargetArticleId);
        var metadata = await f.Context.ArticleTranslationMetadata.AsNoTracking()
            .SingleAsync(x => x.ArticleId == result.TargetArticleId);
        Assert.Equal(ArticleStatuses.Draft, article.Status);
        Assert.Null(article.LastPublishedVersionIdFk);
        Assert.Equal(plan.Source.SourceVersionId, metadata.SourceVersionId);
        Assert.Equal(ArticleTranslationStatuses.NeedsTranslation, metadata.TranslationStatus);
        Assert.Equal(ArticleTranslationMethods.Copied, metadata.TranslationMethod);
        Assert.Single(await f.Context.ArticleDrafts.AsNoTracking()
            .Where(x => x.ArticleIdFk == result.TargetArticleId).ToListAsync());
        Assert.Single(await f.Context.ArticleAuditLogs.AsNoTracking().Where(x =>
            x.ArticleIdFk == result.TargetArticleId && x.ActionType == ArticleAuditActions.LocalizationSynchronized)
            .ToListAsync());
    }

    [Fact]
    public async Task Localization_sync_updates_into_a_new_draft_and_preserves_published_history()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var translated = await f.AddLinkedTranslationAsync(ArticleStatuses.Published, true);
        var oldSource = await f.Context.ArticleVersions.AsNoTracking().Where(x => x.ArticleIdFk == f.ArticleId)
            .OrderBy(x => x.VersionNumber).FirstAsync();
        await f.Context.ArticleTranslationMetadata.Where(x => x.ArticleId == translated.ArticleId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.SourceVersionId, oldSource.VersionId)
                .SetProperty(x => x.SourceVersionNumber, oldSource.VersionNumber)
                .SetProperty(x => x.TranslationStatus, ArticleTranslationStatuses.OutOfDate));
        f.Context.ChangeTracker.Clear();
        var repository = new LocalizationSynchronizationRepository(f.Context);
        var plan = await repository.GetPlanAsync(f.ArticleId, ["ar"], default);
        var target = Assert.Single(plan.Targets);
        Assert.Equal(LocalizationSyncStates.OutOfDate, target.State);
        var versionCount = await f.Context.ArticleVersions.CountAsync(x => x.ArticleIdFk == translated.ArticleId);

        var result = await repository.CommitAsync(new(plan.Source, "ar", translated.ArticleId,
            target.TargetCurrentDraftId, target.TargetDraftRowVersion,
            LocalizationSyncOperations.UpdateAutomaticTranslation, "Arabic synchronized",
            "sync/ar/content.json", "automatic-hash", 84, [], ArticleTranslationMethods.Automatic,
            ArticleTranslationStatuses.NeedsVerification, "Fake", 3, f.AuthorId, DateTime.UtcNow), default);

        var article = await f.Context.Articles.AsNoTracking().SingleAsync(x => x.ArticleId == translated.ArticleId);
        var metadata = await f.Context.ArticleTranslationMetadata.AsNoTracking()
            .SingleAsync(x => x.ArticleId == translated.ArticleId);
        Assert.Equal(ArticleStatuses.Published, article.Status);
        Assert.Equal(translated.PublishedVersionId, article.LastPublishedVersionIdFk);
        Assert.NotEqual(translated.DraftId, article.CurrentDraftIdFk);
        Assert.Equal(result.TargetDraftId, article.CurrentDraftIdFk);
        Assert.Equal(2, await f.Context.ArticleDrafts.CountAsync(x => x.ArticleIdFk == translated.ArticleId));
        Assert.Equal(versionCount, await f.Context.ArticleVersions.CountAsync(x => x.ArticleIdFk == translated.ArticleId));
        Assert.Equal(plan.Source.SourceVersionId, metadata.SourceVersionId);
        Assert.Equal(ArticleTranslationStatuses.NeedsVerification, metadata.TranslationStatus);
        Assert.Equal(ArticleTranslationMethods.Automatic, metadata.TranslationMethod);
    }

    [Fact]
    public async Task Legacy_automatic_translation_also_preserves_the_previous_draft()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var translated = await f.AddLinkedTranslationAsync(ArticleStatuses.Draft, false);
        await f.Context.ArticleDrafts.Where(x => x.DraftId == translated.DraftId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, ArticleStatuses.Draft));
        f.Context.ChangeTracker.Clear();
        var repository = new AutomaticArticleTranslationRepository(f.Context);
        var snapshot = await repository.GetSnapshotAsync(f.ArticleId, translated.ArticleId, default);

        var committed = await repository.CommitAsync(new(snapshot, "Arabic automatic",
            "automatic/new-draft.json", "new-hash", 100, [], "Fake", 4, f.AuthorId,
            DateTime.UtcNow), default);

        Assert.NotEqual(translated.DraftId, committed.TargetDraftId);
        Assert.Equal(2, await f.Context.ArticleDrafts.CountAsync(x => x.ArticleIdFk == translated.ArticleId));
        Assert.Equal(committed.TargetDraftId, (await f.Context.Articles.AsNoTracking()
            .SingleAsync(x => x.ArticleId == translated.ArticleId)).CurrentDraftIdFk);
        Assert.True(await f.Context.ArticleDrafts.AsNoTracking().AnyAsync(x =>
            x.DraftId == translated.DraftId && x.ContentJsonStoragePath != "automatic/new-draft.json"));
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly FakePermissionChecker permissions;
        public KbDbContext Context { get; }
        public ArticleLifecycleService Service { get; }
        public MutableCurrentUser Current { get; }
        public FakeStorage Storage { get; }
        public Guid ArticleId { get; }
        public Guid DraftId { get; }
        public Guid AuthorId { get; }
        public Guid ReviewerId { get; }
        public Guid PublisherId { get; }
        public byte[] RowVersion { get; private set; }
        public string DraftContentPath { get; }

        private Fixture(
            SqliteConnection connection,
            KbDbContext context,
            ArticleLifecycleService service,
            MutableCurrentUser current,
            FakePermissionChecker permissions,
            FakeStorage storage,
            Guid articleId,
            Guid draftId,
            Guid authorId,
            Guid reviewerId,
            Guid publisherId,
            byte[] rowVersion,
            string draftContentPath)
        {
            this.connection = connection;
            Context = context;
            Service = service;
            Current = current;
            this.permissions = permissions;
            Storage = storage;
            ArticleId = articleId;
            DraftId = draftId;
            AuthorId = authorId;
            ReviewerId = reviewerId;
            PublisherId = publisherId;
            RowVersion = rowVersion;
            DraftContentPath = draftContentPath;
        }

        public static async Task<Fixture> CreateAsync(string status = ArticleStatuses.Draft)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(
                new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var authorId = Guid.NewGuid();
            var reviewerId = Guid.NewGuid();
            var publisherId = Guid.NewGuid();
            var articleId = Guid.NewGuid();
            var draftId = Guid.NewGuid();
            var categoryId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            context.Users.AddRange(
                User(authorId, "Author", now),
                User(reviewerId, "Reviewer", now),
                User(publisherId, "Publisher", now));
            context.Categories.Add(new Category
            {
                CategoryId = categoryId,
                Name = "Guides",
                Slug = $"guides-{categoryId:N}",
                SortOrder = 0,
                Depth = 0,
                Path = $"/{categoryId:D}/"
            });
            context.Articles.Add(new Article
            {
                ArticleId = articleId,
                Title = "Lifecycle Article",
                Slug = $"lifecycle-{articleId:N}",
                CategoryIdFk = categoryId,
                AuthorIdFk = authorId,
                Status = status,
                CreatedAt = now,
                UpdatedAt = now
            });
            await context.SaveChangesAsync();
            var rowVersion = Guid.NewGuid().ToByteArray();
            var contentPath = $"articles/{articleId:N}/drafts/{draftId:N}/content.json";
            var htmlPath = $"articles/{articleId:N}/drafts/{draftId:N}/content.html";
            const string document = """{"type":"doc","content":[{"type":"paragraph"}]}""";
            var documentBytes = Encoding.UTF8.GetBytes(document);
            var contentHash = Convert.ToHexString(SHA256.HashData(documentBytes)).ToLowerInvariant();
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, ContentJsonStoragePath, RenderedHtmlStoragePath,
                     ContentHash, ContentSizeBytes, RowVersion, IsLocked, CreatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({draftId}, {articleId}, {contentPath}, {htmlPath}, {contentHash}, {documentBytes.LongLength}, {rowVersion},
                        {false}, {authorId}, {now}, {now}, {status})
                """);
            var article = await context.Articles.SingleAsync(item => item.ArticleId == articleId);
            article.CurrentDraftIdFk = draftId;
            await context.SaveChangesAsync();
            context.ChangeTracker.Clear();

            var current = new MutableCurrentUser { UserId = authorId };
            var permissions = new FakePermissionChecker();
            var storage = new FakeStorage();
            storage.Seed(contentPath, documentBytes);
            storage.Seed(htmlPath, Encoding.UTF8.GetBytes("<p>Lifecycle</p>"));
            var service = new ArticleLifecycleService(
                new ArticleLifecycleRepository(context),
                storage,
                current,
                permissions,
                new DatabaseAdminChecker(context),
                TimeProvider.System,
                Options.Create(new DraftContentOptions
                {
                    ContainerName = "article-content",
                    MaxContentSizeBytes = DraftContentOptions.DefaultMaxContentSizeBytes
                }),
                new NotificationService(new NotificationRepository(context), current, TimeProvider.System));
            var fixture = new Fixture(connection, context, service, current, permissions, storage, articleId,
                draftId, authorId, reviewerId, publisherId, rowVersion, contentPath);
            if (status != ArticleStatuses.Draft)
                await fixture.AddVersionDocumentAsync(1, ArticleSnapshotReasons.SubmittedForReview, document);
            return fixture;
        }

        public static async Task<Fixture> CreateApprovedAsync()
        {
            var fixture = await CreateAsync(ArticleStatuses.Approved);
            fixture.RowVersion = (await fixture.Context.ArticleDrafts.AsNoTracking().SingleAsync()).RowVersion;
            return fixture;
        }

        public static async Task<Fixture> CreatePublishedAsync()
        {
            var fixture = await CreateApprovedAsync();
            fixture.Grant(fixture.PublisherId, PermissionCodes.ArticlesPublish);
            fixture.Current.UserId = fixture.PublisherId;
            var published = await fixture.Service.PublishAsync(
                fixture.ArticleId, new(fixture.RowVersion), default);
            fixture.RowVersion = published.RowVersion;
            return fixture;
        }

        public void Grant(Guid userId, params string[] permissionCodes) =>
            permissions.Grant(userId, permissionCodes);

        public async Task<ArticleVersion> PublishedVersionAsync()
        {
            var versionId = (await Context.Articles.AsNoTracking().SingleAsync(article => article.ArticleId == ArticleId)).LastPublishedVersionIdFk;
            return await Context.ArticleVersions.AsNoTracking()
                .SingleAsync(version => version.VersionId == versionId);
        }

        public async Task UpdateDraftContentAsync(string text)
        {
            var document = JsonSerializer.Serialize(new
            {
                type = "doc",
                content = new[] { new { type = "paragraph", content = new[] { new { type = "text", text } } } }
            });
            var bytes = Encoding.UTF8.GetBytes(document);
            var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            Storage.Seed(DraftContentPath, bytes);
            await Context.ArticleDrafts.Where(item => item.DraftId == DraftId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(item => item.ContentHash, hash)
                    .SetProperty(item => item.ContentSizeBytes, bytes.LongLength));
            Context.ChangeTracker.Clear();
        }

        public async Task MarkAdminAsync(Guid userId)
        {
            var roleId = Guid.NewGuid();
            Context.Roles.Add(new Role { RoleId = roleId, RoleName = "Admin" });
            Context.UserRoles.Add(new UserRole
                { UserId = userId, RoleId = roleId, AssignedAt = DateTime.UtcNow });
            await Context.SaveChangesAsync();
            Context.ChangeTracker.Clear();
        }

        public void TrackPermissionCheckConcurrency() =>
            permissions.TrackConcurrency = true;

        public int MaxConcurrentPermissionChecks =>
            permissions.MaxConcurrentChecks;

        public Task<ArticleVersion> AddVersionAsync(
            int number,
            string reason,
            string text,
            bool isPublished = false,
            string? renderedHtml = null)
        {
            var document = JsonSerializer.Serialize(new
            {
                type = "doc",
                content = new[]
                {
                    new
                    {
                        type = "paragraph",
                        content = new[] { new { type = "text", text } }
                    }
                }
            });
            return AddVersionDocumentAsync(number, reason, document, isPublished, renderedHtml, text);
        }

        public async Task<ArticleVersion> AddVersionDocumentAsync(
            int number,
            string reason,
            string document,
            bool isPublished = false,
            string? renderedHtml = null,
            string? plainText = null)
        {
            var id = Guid.NewGuid();
            var prefix = $"articles/{ArticleId:N}/versions/{id:N}";
            var jsonPath = $"{prefix}/content.json";
            var htmlPath = renderedHtml is null ? null : $"{prefix}/content.html";
            var textPath = plainText is null ? null : $"{prefix}/content.txt";
            var bytes = Encoding.UTF8.GetBytes(document);
            Storage.Seed(jsonPath, bytes);
            if (htmlPath is not null) Storage.Seed(htmlPath, Encoding.UTF8.GetBytes(renderedHtml!));
            if (textPath is not null) Storage.Seed(textPath, Encoding.UTF8.GetBytes(plainText!));
            var now = DateTime.UtcNow.AddMinutes(number);
            var version = new ArticleVersion
            {
                VersionId = id,
                ArticleIdFk = ArticleId,
                VersionNumber = number,
                SourceDraftIdFk = DraftId,
                SourceDraftNumber = 1,
                SnapshotReason = reason,
                ContentJsonStoragePath = jsonPath,
                RenderedHtmlStoragePath = htmlPath,
                PlainTextStoragePath = textPath,
                ContentHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                ContentSizeBytes = bytes.LongLength,
                CreatedByFk = AuthorId,
                CreatedAt = now,
                PublishedByFk = isPublished ? PublisherId : null,
                PublishedAt = isPublished ? now : null
            };
            Context.ArticleVersions.Add(version);
            await Context.SaveChangesAsync();
            Context.ChangeTracker.Clear();
            return version;
        }

        public async Task<LinkedTranslation> AddLinkedTranslationAsync(string status, bool withPublishedVersion)
        {
            var source = await Context.Articles.AsNoTracking().SingleAsync(x => x.ArticleId == ArticleId);
            var sourceVersion = await PublishedVersionAsync();
            var articleId = Guid.NewGuid();
            var draftId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            var contentPath = $"articles/{articleId:N}/drafts/{draftId:N}/content.json";
            const string document = """{"type":"doc","content":[{"type":"paragraph"}]}""";
            var bytes = Encoding.UTF8.GetBytes(document);
            var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            if (!await Context.KbLanguages.AnyAsync(x => x.LocaleCode == "ar"))
            {
                Context.KbLanguages.Add(new KbLanguage
                {
                    LanguageId = Guid.NewGuid(), LocaleCode = "ar", DisplayName = "Arabic", NativeName = "العربية",
                    IsEnabled = true, IsRtl = true, SortOrder = 1, CreatedAt = now, UpdatedAt = now
                });
                await Context.SaveChangesAsync();
            }
            Context.Articles.Add(new Article
            {
                ArticleId = articleId, Title = "Arabic translation", Slug = $"ar-{articleId:N}",
                CategoryIdFk = source.CategoryIdFk, AuthorIdFk = AuthorId, Status = status,
                LocaleCode = "ar", TranslationGroupId = source.TranslationGroupId, CreatedAt = now, UpdatedAt = now,
                ArticleTranslationMetadata = new ArticleTranslationMetadata
                {
                    ArticleId = articleId, SourceArticleId = ArticleId, SourceVersionId = sourceVersion.VersionId,
                    SourceVersionNumber = sourceVersion.VersionNumber, TranslationMethod = ArticleTranslationMethods.Manual,
                    TranslationStatus = ArticleTranslationStatuses.Verified, LastTranslatedAt = now,
                    VerifiedAt = now, VerifiedByUserId = AuthorId
                }
            });
            await Context.SaveChangesAsync();
            var rowVersion = Guid.NewGuid().ToByteArray();
            await Context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, DraftNumber, ContentJsonStoragePath, ContentHash, ContentSizeBytes,
                     RowVersion, IsLocked, CreatedBy_FK, UpdatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({draftId}, {articleId}, {1}, {contentPath}, {hash}, {bytes.LongLength}, {rowVersion},
                        {false}, {AuthorId}, {AuthorId}, {now}, {now}, {ArticleStatuses.Approved})
                """);
            var submittedId = Guid.NewGuid();
            Context.ArticleVersions.Add(new ArticleVersion
            {
                VersionId = submittedId, ArticleIdFk = articleId, VersionNumber = 1, SourceDraftIdFk = draftId,
                SourceDraftNumber = 1, SnapshotReason = ArticleSnapshotReasons.SubmittedForReview,
                ContentJsonStoragePath = contentPath, ContentHash = hash, ContentSizeBytes = bytes.LongLength,
                CreatedByFk = AuthorId, CreatedAt = now
            });
            Guid? publishedVersionId = null;
            if (withPublishedVersion)
            {
                publishedVersionId = Guid.NewGuid();
                Context.ArticleVersions.Add(new ArticleVersion
                {
                    VersionId = publishedVersionId.Value, ArticleIdFk = articleId, VersionNumber = 2,
                    SourceDraftIdFk = draftId, SourceDraftNumber = 1, SnapshotReason = ArticleSnapshotReasons.Published,
                    ContentJsonStoragePath = contentPath, ContentHash = hash, ContentSizeBytes = bytes.LongLength,
                    CreatedByFk = AuthorId, CreatedAt = now, PublishedByFk = PublisherId, PublishedAt = now
                });
            }
            await Context.SaveChangesAsync();
            var article = await Context.Articles.SingleAsync(x => x.ArticleId == articleId);
            article.CurrentDraftIdFk = draftId;
            article.LastPublishedVersionIdFk = publishedVersionId;
            await Context.SaveChangesAsync();
            Storage.Seed(contentPath, bytes);
            Context.ChangeTracker.Clear();
            return new(articleId, draftId, rowVersion, publishedVersionId);
        }

        public ArticleDraftService CreateDraftService() => new(
            new ArticleDraftRepository(Context),
            Storage,
            Current,
            permissions,
            TimeProvider.System,
            Options.Create(new DraftContentOptions
            {
                ContainerName = "article-content",
                MaxContentSizeBytes = DraftContentOptions.DefaultMaxContentSizeBytes
            }));

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static User User(Guid id, string name, DateTime now) => new()
        {
            UserId = id,
            Email = $"{id}@example.test",
            FullName = name,
            IsActive = true,
            CreatedAt = now
        };
    }

    private sealed record LinkedTranslation(Guid ArticleId, Guid DraftId, byte[] RowVersion, Guid? PublishedVersionId);

    private sealed class MutableCurrentUser : ICurrentUser
    {
        public bool IsAuthenticated { get; set; } = true;
        public Guid UserId { get; set; }
        public string? Email => null;
    }

    private sealed class FakePermissionChecker : IPermissionChecker
    {
        private readonly Dictionary<Guid, HashSet<string>> permissions = [];
        private int activeChecks;
        private int maxConcurrentChecks;

        public bool TrackConcurrency { get; set; }
        public int MaxConcurrentChecks => Volatile.Read(ref maxConcurrentChecks);

        public void Grant(Guid userId, IEnumerable<string> values)
        {
            if (!permissions.TryGetValue(userId, out var existing))
                permissions[userId] = existing = new(StringComparer.Ordinal);
            existing.UnionWith(values);
        }

        public async Task<bool> HasPermissionAsync(
            Guid userId,
            string permissionCode,
            CancellationToken cancellationToken)
        {
            if (!TrackConcurrency)
                return HasPermission(userId, permissionCode);

            var concurrentChecks = Interlocked.Increment(ref activeChecks);
            InterlockedExtensions.Max(ref maxConcurrentChecks, concurrentChecks);
            try
            {
                await Task.Delay(10, cancellationToken);
                return HasPermission(userId, permissionCode);
            }
            finally
            {
                Interlocked.Decrement(ref activeChecks);
            }
        }

        private bool HasPermission(Guid userId, string permissionCode) =>
            permissions.TryGetValue(userId, out var values) && values.Contains(permissionCode);
    }

    private static class InterlockedExtensions
    {
        public static void Max(ref int location, int value)
        {
            var current = Volatile.Read(ref location);
            while (current < value)
            {
                var observed = Interlocked.CompareExchange(ref location, value, current);
                if (observed == current)
                    return;
                current = observed;
            }
        }
    }

    private sealed class FakeStorage : IObjectStorage
    {
        private readonly ConcurrentDictionary<string, byte[]> content = new(StringComparer.Ordinal);
        private int uploadCount;
        public int? FailUploadNumber { get; set; }
        public string? FailDownloadPath { get; set; }
        public ConcurrentBag<string> UploadedPaths { get; } = [];
        public ConcurrentBag<string> DownloadedPaths { get; } = [];
        public ConcurrentBag<string> DeletedPaths { get; } = [];
        public IReadOnlyCollection<string> StoredPaths => content.Keys.ToArray();

        public void Seed(string path, byte[] bytes) => content[path] = bytes;
        public byte[] Get(string path) => content[path];

        public async Task<string> UploadAsync(
            string containerName,
            string objectName,
            Stream source,
            string contentType,
            CancellationToken cancellationToken)
        {
            var number = Interlocked.Increment(ref uploadCount);
            if (FailUploadNumber == number)
                throw new IOException("Simulated upload failure.");
            using var destination = new MemoryStream();
            await source.CopyToAsync(destination, cancellationToken);
            content[objectName] = destination.ToArray();
            UploadedPaths.Add(objectName);
            return objectName;
        }

        public Task<Stream> DownloadAsync(
            string containerName,
            string objectName,
            CancellationToken cancellationToken)
        {
            DownloadedPaths.Add(objectName);
            if (objectName == FailDownloadPath)
                throw new IOException("Simulated download failure.");
            if (!content.TryGetValue(objectName, out var bytes))
                throw new FileNotFoundException("Object not found.", objectName);
            return Task.FromResult<Stream>(new MemoryStream(bytes, writable: false));
        }

        public Task DeleteAsync(
            string containerName,
            string objectName,
            CancellationToken cancellationToken)
        {
            content.TryRemove(objectName, out _);
            DeletedPaths.Add(objectName);
            return Task.CompletedTask;
        }
    }
}
