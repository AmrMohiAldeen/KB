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
        f.Current.UserId = f.AuthorId;
        var resubmitted = await f.Service.ResubmitAsync(f.ArticleId,
            new(changes.RowVersion, "Added"), default);
        f.Current.UserId = f.ReviewerId;
        var restarted = await f.Service.StartReviewAsync(f.ArticleId,
            new(resubmitted.RowVersion), default);
        var approved = await f.Service.ApproveAsync(f.ArticleId,
            new(restarted.RowVersion, "Approved"), default);
        f.Current.UserId = f.PublisherId;
        var published = await f.Service.PublishAsync(f.ArticleId,
            new(approved.RowVersion, "Ship it"), default);

        Assert.Equal(ArticleStatuses.Published, published.Status);
        Assert.Equal(4, published.PublishedVersionNumber);
        Assert.NotNull(published.PublishedVersionId);
        f.Context.ChangeTracker.Clear();
        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(published.PublishedVersionId, article.LastPublishedVersionIdFk);
        Assert.Equal(ArticleStatuses.Published, article.Status);
        var versions = await f.Context.ArticleVersions.AsNoTracking()
            .OrderBy(version => version.VersionNumber).ToArrayAsync();
        Assert.Equal(
            [
                ArticleSnapshotReasons.SubmittedForReview,
                ArticleSnapshotReasons.ResubmittedForReview,
                ArticleSnapshotReasons.Approved,
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
        Assert.Equal((SearchIndexJobTypes.Upsert, JobStatuses.Pending, version.VersionId),
            (job.JobType, job.Status, job.VersionIdFk));
        Assert.Equal(7, await f.Context.ArticleReviewEvents.CountAsync());
        Assert.Equal(11, await f.Context.ArticleAuditLogs.CountAsync());
        Assert.Equal(4, await f.Context.ArticleAuditLogs.CountAsync(
            log => log.ActionType == ArticleAuditActions.VersionCreated));
        var versionAudit = await f.Context.ArticleAuditLogs.AsNoTracking().SingleAsync(
            log => log.EntityId == version.VersionId &&
                   log.ActionType == ArticleAuditActions.VersionCreated);
        using var versionMetadata = JsonDocument.Parse(versionAudit.MetaDataJson!);
        Assert.Equal(4, versionMetadata.RootElement.GetProperty("versionNumber").GetInt32());
        Assert.Equal(ArticleSnapshotReasons.Published,
            versionMetadata.RootElement.GetProperty("snapshotReason").GetString());
        var publishAudit = await f.Context.ArticleAuditLogs.SingleAsync(
            log => log.ActionType == ArticleAuditActions.Published);
        using var metadata = JsonDocument.Parse(publishAudit.MetaDataJson!);
        Assert.Equal(ArticleStatuses.Approved,
            metadata.RootElement.GetProperty("previousState").GetString());
        Assert.Equal(ArticleStatuses.Published,
            metadata.RootElement.GetProperty("newState").GetString());
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
    public async Task Publish_storage_failure_leaves_database_approved_and_cleans_staged_objects()
    {
        await using var f = await Fixture.CreateApprovedAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesPublish);
        f.Current.UserId = f.PublisherId;
        f.Storage.FailUploadNumber = 2;

        await Assert.ThrowsAsync<ExternalServiceException>(() => f.Service.PublishAsync(
            f.ArticleId, new(f.RowVersion), default));

        f.Context.ChangeTracker.Clear();
        Assert.Equal(ArticleStatuses.Approved,
            (await f.Context.Articles.AsNoTracking().SingleAsync()).Status);
        Assert.Empty(await f.Context.ArticleVersions.AsNoTracking().ToListAsync());
        Assert.Empty(await f.Context.SearchIndexJobs.AsNoTracking().ToListAsync());
        Assert.All(f.Storage.UploadedPaths, path => Assert.Contains(path, f.Storage.DeletedPaths));
    }

    [Fact]
    public async Task Restore_copies_version_into_new_editable_draft_and_preserves_published_version()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        f.Grant(f.PublisherId, PermissionCodes.VersionsRestore);
        f.Current.UserId = f.PublisherId;
        var publishedArticle = await f.Context.Articles.AsNoTracking().SingleAsync();
        var publishedVersion = await f.Context.ArticleVersions.AsNoTracking().SingleAsync();
        var publishedPath = publishedVersion.ContentJsonStoragePath;

        var restored = await f.Service.RestoreAsync(f.ArticleId, publishedVersion.VersionId,
            new(f.RowVersion), default);

        Assert.Equal(ArticleStatuses.Draft, restored.Status);
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

        Assert.Equal(immutablePublishedBytes, f.Storage.Get(publishedPath));
        Assert.Contains(publishedPath, f.Storage.StoredPaths);
        Assert.DoesNotContain(publishedPath, f.Storage.DeletedPaths);
    }

    [Fact]
    public async Task Published_draft_cannot_be_locked_or_edited_until_a_new_draft_is_created()
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
        var version = await f.Context.ArticleVersions.AsNoTracking().SingleAsync();
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
        var version = await f.Context.ArticleVersions.AsNoTracking().SingleAsync();
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
        Assert.Equal(ArticleStatuses.Draft, article.Status);
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
    public async Task Archive_soft_deletes_with_concurrency_and_audit()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.PublisherId, PermissionCodes.ArticlesDelete);
        f.Current.UserId = f.PublisherId;

        await f.Service.ArchiveAsync(f.ArticleId, f.RowVersion, default);

        var article = await f.Context.Articles.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleStatuses.Deleted, article.Status);
        Assert.NotNull(article.DeletedAt);
        var audit = await f.Context.ArticleAuditLogs.AsNoTracking().SingleAsync();
        Assert.Equal(ArticleAuditActions.Deleted, audit.ActionType);
        Assert.Contains("\"newState\":\"Deleted\"", audit.MetaDataJson);
    }

    [Fact]
    public async Task Version_rows_are_append_only()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var version = await f.Context.ArticleVersions.SingleAsync();
        version.SnapshotReason = ArticleSnapshotReasons.Approved;

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => f.Context.SaveChangesAsync());

        Assert.Contains("immutable", exception.Message, StringComparison.OrdinalIgnoreCase);
        f.Context.ChangeTracker.Clear();
        var unchanged = await f.Context.ArticleVersions.AsNoTracking().SingleAsync();
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
        var changed = comparison.Changes[0];
        Assert.Equal("Changed", changed.ChangeType);
        Assert.Equal("Install the old package", changed.BeforeText);
        Assert.Equal("Install the new package", changed.AfterText);
        Assert.Contains(changed.Segments, segment =>
            segment.ChangeType == "Removed" && segment.Text.Contains("old"));
        Assert.Contains(changed.Segments, segment =>
            segment.ChangeType == "Added" && segment.Text.Contains("new"));
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
    public async Task Restore_requires_restore_permission_and_current_row_version()
    {
        await using var f = await Fixture.CreatePublishedAsync();
        var version = await f.Context.ArticleVersions.AsNoTracking().SingleAsync();
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
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, ContentJsonStoragePath, RenderedHtmlStoragePath,
                     ContentSizeBytes, RowVersion, IsLocked, CreatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({draftId}, {articleId}, {contentPath}, {htmlPath}, {42L}, {rowVersion},
                        {false}, {authorId}, {now}, {now}, {status})
                """);
            var article = await context.Articles.SingleAsync(item => item.ArticleId == articleId);
            article.CurrentDraftIdFk = draftId;
            await context.SaveChangesAsync();
            context.ChangeTracker.Clear();

            var current = new MutableCurrentUser { UserId = authorId };
            var permissions = new FakePermissionChecker();
            var storage = new FakeStorage();
            storage.Seed(contentPath, Encoding.UTF8.GetBytes(
                """{"type":"doc","content":[{"type":"paragraph"}]}"""));
            storage.Seed(htmlPath, Encoding.UTF8.GetBytes("<p>Lifecycle</p>"));
            var service = new ArticleLifecycleService(
                new ArticleLifecycleRepository(context),
                storage,
                current,
                permissions,
                TimeProvider.System,
                Options.Create(new DraftContentOptions
                {
                    ContainerName = "article-content",
                    MaxContentSizeBytes = DraftContentOptions.DefaultMaxContentSizeBytes
                }));
            return new(connection, context, service, current, permissions, storage, articleId,
                draftId, authorId, reviewerId, publisherId, rowVersion, contentPath);
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

    private sealed class MutableCurrentUser : ICurrentUser
    {
        public bool IsAuthenticated { get; set; } = true;
        public Guid UserId { get; set; }
        public string? Email => null;
    }

    private sealed class FakePermissionChecker : IPermissionChecker
    {
        private readonly Dictionary<Guid, HashSet<string>> permissions = [];

        public void Grant(Guid userId, IEnumerable<string> values)
        {
            if (!permissions.TryGetValue(userId, out var existing))
                permissions[userId] = existing = new(StringComparer.Ordinal);
            existing.UnionWith(values);
        }

        public Task<bool> HasPermissionAsync(
            Guid userId,
            string permissionCode,
            CancellationToken cancellationToken) =>
            Task.FromResult(permissions.TryGetValue(userId, out var values) &&
                            values.Contains(permissionCode));
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
