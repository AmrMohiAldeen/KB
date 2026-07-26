using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Drafts;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kb.Tests.Articles;

public sealed class ArticleDraftSliceTests
{
    [Fact]
    public async Task Loading_returns_empty_tiptap_document_and_editability_when_no_content_file_exists()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);

        var loaded = await f.Service.GetAsync(f.ArticleId, default);

        Assert.Equal("doc", loaded.Content.GetProperty("type").GetString());
        Assert.Empty(loaded.Content.GetProperty("content").EnumerateArray());
        Assert.True(loaded.CanEdit);
        Assert.False(loaded.IsLockOwner);
        Assert.Empty(f.Storage.DownloadedPaths);

        f.Current.UserId = f.ViewerId;
        var viewer = await f.Service.GetAsync(f.ArticleId, default);
        Assert.False(viewer.CanEdit);
    }

    [Fact]
    public async Task Loading_reads_current_tiptap_json_from_private_storage()
    {
        await using var f = await Fixture.CreateAsync("existing/content.json");
        var expected = Tiptap("stored content");
        f.Storage.Seed("existing/content.json", JsonSerializer.SerializeToUtf8Bytes(expected));

        var loaded = await f.Service.GetAsync(f.ArticleId, default);

        Assert.Equal("stored content", loaded.Content.GetProperty("content")[0]
            .GetProperty("content")[0].GetProperty("text").GetString());
        Assert.Contains("existing/content.json", f.Storage.DownloadedPaths);
    }

    [Fact]
    public async Task Lock_acquisition_succeeds_is_idempotent_for_owner_and_rejects_competitor()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        f.Grant(f.OtherUserId, PermissionCodes.ArticlesEditAnyDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);

        var acquired = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);
        Assert.True(acquired.Draft.IsLocked);
        Assert.Equal(f.AuthorId, acquired.Draft.LockedBy!.Id);

        var idempotent = await f.Service.AcquireLockAsync(f.ArticleId, acquired.Draft.RowVersion, default);
        Assert.Equal(acquired.Draft.RowVersion, idempotent.Draft.RowVersion);
        Assert.Single(await f.Context.ArticleAuditLogs
            .Where(log => log.ActionType == ArticleAuditActions.DraftLockAcquired).ToListAsync());

        f.Current.UserId = f.OtherUserId;
        await Assert.ThrowsAsync<ConflictException>(() =>
            f.Service.AcquireLockAsync(f.ArticleId, acquired.Draft.RowVersion, default));
    }

    [Fact]
    public async Task Only_lock_owner_can_save_and_normally_release()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        f.Grant(f.OtherUserId, PermissionCodes.ArticlesEditAnyDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);

        f.Current.UserId = f.ViewerId;
        f.Grant(f.ViewerId, PermissionCodes.SuggestionsCreate);
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap("contributor"), null, null, locked.Draft.RowVersion), default));

        f.Current.UserId = f.OtherUserId;
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap("blocked"), null, null, locked.Draft.RowVersion), default));
        await Assert.ThrowsAsync<ConflictException>(() =>
            f.Service.ReleaseLockAsync(f.ArticleId, locked.Draft.RowVersion, default));
        Assert.Empty(f.Storage.UploadedPaths);

        f.Current.UserId = f.AuthorId;
        var saved = await f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap("saved"), "<p>saved</p>", "saved", locked.Draft.RowVersion), default);
        var released = await f.Service.ReleaseLockAsync(f.ArticleId, saved.RowVersion, default);
        Assert.False(released.Draft.IsLocked);
        Assert.Null(released.Draft.LockedBy);
    }

    [Fact]
    public async Task Force_release_requires_locks_manage_permission_in_application_layer()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);
        f.Current.UserId = f.OtherUserId;

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            f.Service.ForceReleaseLockAsync(f.ArticleId, locked.Draft.RowVersion, default));

        f.Grant(f.OtherUserId, PermissionCodes.LocksManage);
        var released = await f.Service.ForceReleaseLockAsync(f.ArticleId, locked.Draft.RowVersion, default);
        Assert.False(released.Draft.IsLocked);
        Assert.Single(await f.Context.ArticleAuditLogs
            .Where(log => log.ActionType == ArticleAuditActions.DraftLockForceReleased).ToListAsync());
    }

    [Fact]
    public async Task Stale_row_versions_conflict_for_lock_save_and_release()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var stale = initial.Draft.RowVersion.ToArray();
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, stale, default);

        await Assert.ThrowsAsync<ConcurrencyConflictException>(() =>
            f.Service.AcquireLockAsync(f.ArticleId, stale, default));
        await Assert.ThrowsAsync<ConcurrencyConflictException>(() => f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap("stale"), null, null, stale), default));
        await Assert.ThrowsAsync<ConcurrencyConflictException>(() =>
            f.Service.ReleaseLockAsync(f.ArticleId, stale, default));
        Assert.True(locked.Draft.IsLocked);
    }

    [Fact]
    public async Task Simultaneous_lock_attempts_produce_exactly_one_owner()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        f.Grant(f.OtherUserId, PermissionCodes.ArticlesEditAnyDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var (otherService, otherContext, otherConnection) = await f.CreateServiceAsync(f.OtherUserId);
        await using var _ = otherConnection;
        await using var __ = otherContext;
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<(DraftLockData? Result, Exception? Error)> Attempt(ArticleDraftService service)
        {
            await gate.Task;
            try
            {
                return (await service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default), null);
            }
            catch (Exception exception)
            {
                return (null, exception);
            }
        }

        var attempts = new[] { Attempt(f.Service), Attempt(otherService) };
        gate.SetResult();
        var results = await Task.WhenAll(attempts);

        Assert.Single(results, result => result.Result is not null);
        Assert.Single(results, result => result.Error is ConflictException or ConcurrencyConflictException);
        f.Context.ChangeTracker.Clear();
        var stored = await f.Context.ArticleDrafts.AsNoTracking().SingleAsync(draft => draft.DraftId == f.DraftId);
        Assert.True(stored.IsLocked);
        Assert.Contains(stored.LockedByFk, new Guid?[] { f.AuthorId, f.OtherUserId });
    }

    [Fact]
    public async Task Saving_updates_immutable_paths_hash_size_and_removes_previous_files_after_commit()
    {
        await using var f = await Fixture.CreateAsync("old/content.json", "old/content.html", "old/content.txt");
        f.Storage.Seed("old/content.json", Encoding.UTF8.GetBytes("{\"type\":\"doc\",\"content\":[]}"));
        f.Storage.Seed("old/content.html", Encoding.UTF8.GetBytes("old"));
        f.Storage.Seed("old/content.txt", Encoding.UTF8.GetBytes("old"));
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);
        var content = Tiptap("immutable");
        var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(content);

        var saved = await f.Service.SaveContentAsync(f.ArticleId,
            new(content, "<p>immutable</p>", "immutable", locked.Draft.RowVersion), default);

        Assert.StartsWith($"articles/{f.ArticleId:N}/drafts/{f.DraftId:N}/", saved.ContentJsonPath);
        Assert.EndsWith("/content.json", saved.ContentJsonPath);
        Assert.EndsWith("/content.html", saved.RenderedHtmlPath);
        Assert.EndsWith("/content.txt", saved.PlainTextPath);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(jsonBytes)).ToLowerInvariant(), saved.ContentHash);
        Assert.Equal(jsonBytes.LongLength, saved.ContentSizeBytes);
        Assert.Equal(jsonBytes, f.Storage.Get(saved.ContentJsonPath));
        Assert.Contains("old/content.json", f.Storage.DeletedPaths);
        Assert.Contains("old/content.html", f.Storage.DeletedPaths);
        Assert.Contains("old/content.txt", f.Storage.DeletedPaths);
        Assert.DoesNotContain(saved.ContentJsonPath, f.Storage.DeletedPaths);
    }

    [Fact]
    public async Task Storage_failure_cleans_staged_files_without_changing_database_references()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);
        f.Storage.FailUploadNumber = 2;

        await Assert.ThrowsAsync<ExternalServiceException>(() => f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap("failure"), "<p>failure</p>", null, locked.Draft.RowVersion), default));

        f.Context.ChangeTracker.Clear();
        var stored = await f.Context.ArticleDrafts.AsNoTracking().SingleAsync(draft => draft.DraftId == f.DraftId);
        Assert.Equal(string.Empty, stored.ContentJsonStoragePath);
        Assert.Equal(locked.Draft.RowVersion, stored.RowVersion);
        Assert.All(f.Storage.UploadedPaths, path => Assert.Contains(path, f.Storage.DeletedPaths));
        Assert.Empty(f.Storage.StoredPaths);
    }

    [Fact]
    public async Task Database_failure_keeps_previous_files_and_removes_new_unreferenced_files()
    {
        await using var f = await Fixture.CreateAsync("old/content.json");
        f.Storage.Seed("old/content.json", Encoding.UTF8.GetBytes("{\"type\":\"doc\",\"content\":[]}"));
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);
        await f.Context.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER fail_draft_content_update BEFORE UPDATE OF ContentJsonStoragePath ON ARTICLE_DRAFTS
            BEGIN SELECT RAISE(ABORT, 'database failure'); END;
            """);

        await Assert.ThrowsAsync<SqliteException>(() => f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap("database failure"), "<p>new</p>", "new", locked.Draft.RowVersion), default));

        f.Context.ChangeTracker.Clear();
        var stored = await f.Context.ArticleDrafts.AsNoTracking().SingleAsync(draft => draft.DraftId == f.DraftId);
        Assert.Equal("old/content.json", stored.ContentJsonStoragePath);
        Assert.Contains("old/content.json", f.Storage.StoredPaths);
        Assert.DoesNotContain("old/content.json", f.Storage.DeletedPaths);
        Assert.Equal(3, f.Storage.DeletedPaths.Count(path => path.StartsWith("articles/", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task Configured_size_limit_is_enforced_before_storage_writes()
    {
        await using var f = await Fixture.CreateAsync(maxContentBytes: 32);
        f.Grant(f.AuthorId, PermissionCodes.ArticlesEditOwnDraft);
        var initial = await f.Service.GetAsync(f.ArticleId, default);
        var locked = await f.Service.AcquireLockAsync(f.ArticleId, initial.Draft.RowVersion, default);

        await Assert.ThrowsAsync<BusinessRuleException>(() => f.Service.SaveContentAsync(f.ArticleId,
            new(Tiptap(new string('x', 100)), null, null, locked.Draft.RowVersion), default));
        Assert.Empty(f.Storage.UploadedPaths);
    }

    private static JsonElement Tiptap(string text)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            type = "doc",
            content = new[] { new { type = "paragraph", content = new[] { new { type = "text", text } } } }
        }));
        return document.RootElement.Clone();
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection rootConnection;
        private readonly FakePermissionChecker permissions;
        private readonly int maxContentBytes;
        public string ConnectionString { get; }
        public KbDbContext Context { get; }
        public ArticleDraftService Service { get; }
        public MutableCurrentUser Current { get; }
        public FakeStorage Storage { get; }
        public Guid ArticleId { get; }
        public Guid DraftId { get; }
        public Guid AuthorId { get; }
        public Guid OtherUserId { get; }
        public Guid ViewerId { get; }

        private Fixture(SqliteConnection rootConnection, string connectionString, KbDbContext context,
            ArticleDraftService service, MutableCurrentUser current, FakePermissionChecker permissions,
            FakeStorage storage, Guid articleId, Guid draftId, Guid authorId, Guid otherUserId, Guid viewerId,
            int maxContentBytes) =>
            (this.rootConnection, ConnectionString, Context, Service, Current, this.permissions, Storage,
                ArticleId, DraftId, AuthorId, OtherUserId, ViewerId, this.maxContentBytes) =
            (rootConnection, connectionString, context, service, current, permissions, storage,
                articleId, draftId, authorId, otherUserId, viewerId, maxContentBytes);

        public static async Task<Fixture> CreateAsync(string contentJsonPath = "",
            string? htmlPath = null, string? textPath = null,
            int maxContentBytes = DraftContentOptions.DefaultMaxContentSizeBytes)
        {
            var connectionString = $"Data Source=DraftTests{Guid.NewGuid():N};Mode=Memory;Cache=Shared;Default Timeout=5";
            var root = new SqliteConnection(connectionString);
            await root.OpenAsync();
            var context = CreateContext(root);
            await context.Database.EnsureCreatedAsync();
            var authorId = Guid.NewGuid();
            var otherUserId = Guid.NewGuid();
            var viewerId = Guid.NewGuid();
            var articleId = Guid.NewGuid();
            var draftId = Guid.NewGuid();
            var categoryId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            context.Users.AddRange(User(authorId, "Author", now), User(otherUserId, "Reviewer", now),
                User(viewerId, "Viewer", now));
            context.Categories.Add(new Category
            {
                CategoryId = categoryId,
                Name = "Guides",
                Slug = "guides",
                SortOrder = 0,
                Depth = 0,
                Path = $"/{categoryId:D}/"
            });
            context.Articles.Add(new Article
            {
                ArticleId = articleId,
                Title = "Draft Article",
                Slug = $"draft-{articleId:N}",
                CategoryIdFk = categoryId,
                AuthorIdFk = authorId,
                Status = ArticleStatuses.Draft,
                CreatedAt = now,
                UpdatedAt = now
            });
            await context.SaveChangesAsync();
            var rowVersion = Guid.NewGuid().ToByteArray();
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, ContentJsonStoragePath, RenderedHtmlStoragePath,
                     PlainTextStoragePath, ContentSizeBytes, RowVersion, IsLocked, CreatedBy_FK,
                     CreatedAt, UpdatedAt, Status)
                VALUES ({draftId}, {articleId}, {contentJsonPath}, {htmlPath}, {textPath}, {0L},
                        {rowVersion}, {false}, {authorId}, {now}, {now}, {ArticleStatuses.Draft})
                """);
            var article = await context.Articles.SingleAsync(item => item.ArticleId == articleId);
            article.CurrentDraftIdFk = draftId;
            await context.SaveChangesAsync();
            context.ChangeTracker.Clear();

            var current = new MutableCurrentUser { UserId = authorId };
            var permissions = new FakePermissionChecker();
            var storage = new FakeStorage();
            var service = CreateService(context, current, permissions, storage, maxContentBytes);
            return new(root, connectionString, context, service, current, permissions, storage,
                articleId, draftId, authorId, otherUserId, viewerId, maxContentBytes);
        }

        public void Grant(Guid userId, params string[] permissionCodes) => permissions.Grant(userId, permissionCodes);

        public async Task<(ArticleDraftService Service, KbDbContext Context, SqliteConnection Connection)>
            CreateServiceAsync(Guid userId)
        {
            var connection = new SqliteConnection(ConnectionString);
            await connection.OpenAsync();
            var context = CreateContext(connection);
            var service = CreateService(context, new MutableCurrentUser { UserId = userId }, permissions, Storage,
                maxContentBytes);
            return (service, context, connection);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await rootConnection.DisposeAsync();
        }

        private static KbDbContext CreateContext(SqliteConnection connection) => new(
            new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);

        private static ArticleDraftService CreateService(KbDbContext context, MutableCurrentUser current,
            FakePermissionChecker permissions, FakeStorage storage, int maxContentBytes) => new(
            new ArticleDraftRepository(context), storage, current, permissions, TimeProvider.System,
            Options.Create(new DraftContentOptions
            {
                ContainerName = "article-content",
                MaxContentSizeBytes = maxContentBytes
            }));

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
        private readonly Dictionary<Guid, HashSet<string>> values = [];
        private readonly object sync = new();

        public void Grant(Guid userId, IEnumerable<string> permissions)
        {
            lock (sync)
            {
                if (!values.TryGetValue(userId, out var current))
                    values[userId] = current = new(StringComparer.Ordinal);
                current.UnionWith(permissions);
            }
        }

        public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken)
        {
            lock (sync)
                return Task.FromResult(values.TryGetValue(userId, out var current) && current.Contains(permissionCode));
        }
    }

    private sealed class FakeStorage : IObjectStorage
    {
        private readonly ConcurrentDictionary<string, byte[]> content = new(StringComparer.Ordinal);
        private int uploadCount;
        public int? FailUploadNumber { get; set; }
        public ConcurrentBag<string> UploadedPaths { get; } = [];
        public ConcurrentBag<string> DownloadedPaths { get; } = [];
        public ConcurrentBag<string> DeletedPaths { get; } = [];
        public IReadOnlyCollection<string> StoredPaths => content.Keys.ToArray();

        public void Seed(string path, byte[] bytes) => content[path] = bytes;
        public byte[] Get(string path) => content[path];

        public async Task<string> UploadAsync(string containerName, string objectName, Stream source,
            string contentType, CancellationToken cancellationToken)
        {
            var number = Interlocked.Increment(ref uploadCount);
            if (FailUploadNumber == number)
                throw new IOException("Simulated storage failure.");
            using var destination = new MemoryStream();
            await source.CopyToAsync(destination, cancellationToken);
            content[objectName] = destination.ToArray();
            UploadedPaths.Add(objectName);
            return objectName;
        }

        public Task<Stream> DownloadAsync(string containerName, string objectName,
            CancellationToken cancellationToken)
        {
            DownloadedPaths.Add(objectName);
            if (!content.TryGetValue(objectName, out var bytes))
                throw new FileNotFoundException("Object not found.", objectName);
            return Task.FromResult<Stream>(new MemoryStream(bytes, writable: false));
        }

        public Task DeleteAsync(string containerName, string objectName, CancellationToken cancellationToken)
        {
            content.TryRemove(objectName, out _);
            DeletedPaths.Add(objectName);
            return Task.CompletedTask;
        }
    }
}
