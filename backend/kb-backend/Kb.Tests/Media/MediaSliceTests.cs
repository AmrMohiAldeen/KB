using System.Reflection;
using System.Text;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Authorization;
using Kb.Application.Exceptions;
using Kb.Application.Media;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Media;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace Kb.Tests.Media;

public sealed class MediaSliceTests
{
    [Fact]
    public async Task Valid_upload_streams_to_private_storage_and_persists_metadata_and_audit()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate);
        var bytes = Png("payload");

        var uploaded = await fixture.UploadAsync("diagram.png", "image/png", bytes);

        Assert.Equal("diagram.png", uploaded.OriginalFileName);
        Assert.Equal("image/png", uploaded.MimeType);
        Assert.Equal(MediaStatuses.Active, uploaded.Status);
        Assert.DoesNotContain("diagram", uploaded.StoragePath, StringComparison.OrdinalIgnoreCase);
        Assert.EndsWith($"{uploaded.Id:N}.png", uploaded.StoragePath, StringComparison.Ordinal);
        Assert.Equal(bytes, fixture.Storage.Objects[uploaded.StoragePath]);
        var stored = await fixture.Context.MediaFiles.AsNoTracking().SingleAsync();
        Assert.Equal(uploaded.Id, stored.MediaId);
        Assert.Equal("diagram.png", stored.OriginalFileName);
        Assert.Null(stored.AccessUrl);
        Assert.Single(await fixture.Context.ArticleAuditLogs.AsNoTracking()
            .Where(log => log.ActionType == MediaAuditActions.Uploaded &&
                          log.EntityType == MediaAuditEntityTypes.Media).ToListAsync());
    }

    [Theory]
    [InlineData("malware.exe", "application/octet-stream")]
    [InlineData("fake.png", "image/png")]
    [InlineData("photo.png", "application/pdf")]
    [InlineData("../photo.png", "image/png")]
    public async Task Invalid_extensions_content_mime_and_filenames_are_rejected(
        string fileName, string contentType)
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate);

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            fixture.UploadAsync(fileName, contentType, Encoding.UTF8.GetBytes("not a real file")));
        Assert.Empty(fixture.Storage.Objects);
        Assert.Empty(await fixture.Context.MediaFiles.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Empty_and_oversized_files_are_rejected_before_storage()
    {
        await using var fixture = await Fixture.CreateAsync(maxFileSize: 16);
        fixture.Grant(PermissionCodes.ArticlesCreate);

        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            fixture.UploadAsync("empty.txt", "text/plain", []));
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            fixture.UploadAsync("large.txt", "text/plain", new byte[17]));

        Assert.Empty(fixture.Storage.UploadedPaths);
    }

    [Fact]
    public async Task Upload_and_management_require_the_existing_author_and_delete_permissions()
    {
        await using var fixture = await Fixture.CreateAsync();

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            fixture.UploadAsync("notes.txt", "text/plain", Encoding.UTF8.GetBytes("notes")));
        Assert.Empty(fixture.Storage.Objects);

        fixture.Grant(PermissionCodes.ArticlesCreate);
        var media = await fixture.UploadAsync("notes.txt", "text/plain", Encoding.UTF8.GetBytes("notes"));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            fixture.Service.ArchiveAsync(media.Id, default));

        Assert.NotNull(typeof(MediaController).GetCustomAttribute<AuthorizeAttribute>());
        Assert.Equal(PermissionPolicy.For(PermissionCodes.ArticlesCreate),
            typeof(MediaController).GetMethod(nameof(MediaController.Upload))!
                .GetCustomAttribute<AuthorizeAttribute>()!.Policy);
        Assert.Equal(PermissionPolicy.For(PermissionCodes.ArticlesDelete),
            typeof(MediaController).GetMethod(nameof(MediaController.Delete))!
                .GetCustomAttribute<AuthorizeAttribute>()!.Policy);
    }

    [Fact]
    public async Task Storage_failure_after_writing_is_compensated_and_no_metadata_is_created()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate);
        fixture.Storage.FailUploadAfterWrite = true;

        await Assert.ThrowsAsync<ExternalServiceException>(() =>
            fixture.UploadAsync("notes.txt", "text/plain", Encoding.UTF8.GetBytes("notes")));

        Assert.Empty(fixture.Storage.Objects);
        Assert.Single(fixture.Storage.DeletedPaths);
        Assert.Empty(await fixture.Context.MediaFiles.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Database_failure_after_storage_upload_deletes_the_orphaned_object()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate);
        await fixture.Context.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER fail_media_insert BEFORE INSERT ON MEDIA_FILES
            BEGIN SELECT RAISE(ABORT, 'media failure'); END;
            """);

        await Assert.ThrowsAnyAsync<Exception>(() =>
            fixture.UploadAsync("notes.txt", "text/plain", Encoding.UTF8.GetBytes("notes")));

        Assert.Empty(fixture.Storage.Objects);
        Assert.Single(fixture.Storage.DeletedPaths);
        Assert.Empty(await fixture.Context.MediaFiles.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Download_returns_the_private_stream_content_type_and_original_filename()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate);
        var bytes = Pdf("download");
        var uploaded = await fixture.UploadAsync("guide.pdf", "application/pdf", bytes);

        var download = await fixture.Service.DownloadAsync(uploaded.Id, default);
        await using var content = download.Content;
        using var destination = new MemoryStream();
        await content.CopyToAsync(destination);

        Assert.Equal("application/pdf", download.ContentType);
        Assert.Equal("guide.pdf", download.DownloadFileName);
        Assert.Equal(bytes, destination.ToArray());
        Assert.Equal(uploaded.StoragePath, Assert.Single(fixture.Storage.DownloadedPaths));
    }

    [Fact]
    public async Task Listing_applies_search_type_pagination_and_newest_first_order_in_the_database()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate);
        var oldest = await fixture.UploadAsync("old-diagram.png", "image/png", Png("old"));
        fixture.Time.Advance(TimeSpan.FromMinutes(1));
        _ = await fixture.UploadAsync("manual.pdf", "application/pdf", Pdf("manual"));
        fixture.Time.Advance(TimeSpan.FromMinutes(1));
        var newest = await fixture.UploadAsync("new-diagram.png", "image/png", Png("new"));

        var first = await fixture.Service.GetPagedAsync("diagram", "image", null, 1, 1, default);
        var second = await fixture.Service.GetPagedAsync("diagram", "image", null, 2, 1, default);

        Assert.Equal(2, first.TotalCount);
        Assert.Equal(newest.Id, Assert.Single(first.Items).Id);
        Assert.Equal(oldest.Id, Assert.Single(second.Items).Id);
    }

    [Fact]
    public async Task Referenced_media_cannot_be_permanently_deleted_then_deletes_after_reference_removal()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesDelete,
            PermissionCodes.ArticlesEditOwnDraft);
        var uploaded = await fixture.UploadAsync("attachment.txt", "text/plain",
            Encoding.UTF8.GetBytes("attachment"));
        var reference = await fixture.Service.CreateReferenceAsync(uploaded.Id,
            new(fixture.ArticleId, MediaReferenceTypes.Attachment, fixture.ArticleId), default);
        var duplicate = await fixture.Service.CreateReferenceAsync(uploaded.Id,
            new(fixture.ArticleId, MediaReferenceTypes.Attachment, fixture.ArticleId), default);
        Assert.Equal(reference.Id, duplicate.Id);
        Assert.Single(await fixture.Context.MediaReferences.AsNoTracking().ToListAsync());

        await fixture.Service.ArchiveAsync(uploaded.Id, default);
        await Assert.ThrowsAsync<ConflictException>(() =>
            fixture.Service.DeleteAsync(uploaded.Id, default));
        Assert.True(fixture.Storage.Objects.ContainsKey(uploaded.StoragePath));

        await fixture.Service.RemoveReferenceAsync(uploaded.Id, reference.Id, default);
        await fixture.Service.DeleteAsync(uploaded.Id, default);

        Assert.False(fixture.Storage.Objects.ContainsKey(uploaded.StoragePath));
        Assert.Equal(MediaStatuses.Deleted,
            (await fixture.Context.MediaFiles.AsNoTracking().SingleAsync()).Status);
        Assert.Single(await fixture.Context.ArticleAuditLogs.AsNoTracking()
            .Where(log => log.ActionType == MediaAuditActions.Deleted).ToListAsync());
    }

    [Fact]
    public async Task Draft_reference_synchronization_deduplicates_adds_and_removes_references()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Grant(PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesEditOwnDraft);
        var first = await fixture.UploadAsync("first.txt", "text/plain", Encoding.UTF8.GetBytes("first"));
        var second = await fixture.UploadAsync("second.txt", "text/plain", Encoding.UTF8.GetBytes("second"));

        var initial = await fixture.Service.SynchronizeDraftReferencesAsync(fixture.ArticleId,
            [first.Id, first.Id, second.Id], default);
        var changed = await fixture.Service.SynchronizeDraftReferencesAsync(fixture.ArticleId,
            [second.Id], default);

        Assert.Equal(2, initial.Count);
        Assert.Equal(second.Id, Assert.Single(changed).MediaId);
        Assert.Equal(MediaReferenceTypes.Draft, changed[0].EntityType);
        Assert.Equal(fixture.DraftId, changed[0].EntityId);
        Assert.Single(await fixture.Context.MediaReferences.AsNoTracking().ToListAsync());
    }

    private static byte[] Png(string suffix) =>
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, .. Encoding.UTF8.GetBytes(suffix)];

    private static byte[] Pdf(string suffix) => Encoding.ASCII.GetBytes($"%PDF-1.7\n{suffix}");

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly FakePermissionChecker permissions;

        public KbDbContext Context { get; }
        public MediaService Service { get; }
        public FakeStorage Storage { get; }
        public FakeTimeProvider Time { get; }
        public Guid UserId { get; }
        public Guid ArticleId { get; }
        public Guid DraftId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, MediaService service,
            FakeStorage storage, FakePermissionChecker permissions, FakeTimeProvider time,
            Guid userId, Guid articleId, Guid draftId) =>
            (this.connection, Context, Service, Storage, this.permissions, Time, UserId, ArticleId,
                DraftId) = (connection, context, service, storage, permissions, time, userId,
                articleId, draftId);

        public static async Task<Fixture> CreateAsync(long maxFileSize = 1024 * 1024)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();

            var now = new DateTime(2026, 7, 27, 10, 0, 0, DateTimeKind.Utc);
            var userId = Guid.NewGuid();
            var categoryId = Guid.NewGuid();
            var articleId = Guid.NewGuid();
            var draftId = Guid.NewGuid();
            context.Users.Add(new User
            {
                UserId = userId,
                Email = "author@example.test",
                FullName = "Media Author",
                IsActive = true,
                CreatedAt = now
            });
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
                Title = "Media Article",
                Slug = $"media-{articleId:N}",
                CategoryIdFk = categoryId,
                AuthorIdFk = userId,
                Status = ArticleStatuses.Draft,
                CreatedAt = now,
                UpdatedAt = now
            });
            await context.SaveChangesAsync();
            var rowVersion = Guid.NewGuid().ToByteArray();
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, ContentJsonStoragePath, ContentSizeBytes, RowVersion,
                     IsLocked, CreatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({draftId}, {articleId}, {string.Empty}, {0L}, {rowVersion}, {false},
                        {userId}, {now}, {now}, {ArticleStatuses.Draft})
                """);
            await context.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ARTICLES SET CurrentDraftID_FK = {draftId} WHERE ArticleID = {articleId}");
            context.ChangeTracker.Clear();

            var current = new MutableCurrentUser { UserId = userId };
            var permissions = new FakePermissionChecker();
            var storage = new FakeStorage();
            var time = new FakeTimeProvider(new DateTimeOffset(now));
            var service = new MediaService(new MediaRepository(context), storage, current, permissions,
                time, Options.Create(new MediaOptions
                {
                    ContainerName = "media",
                    MaxFileSizeBytes = maxFileSize
                }));
            return new(connection, context, service, storage, permissions, time, userId, articleId,
                draftId);
        }

        public void Grant(params string[] permissionCodes) =>
            permissions.Grant(UserId, permissionCodes);

        public Task<MediaFileData> UploadAsync(string name, string contentType, byte[] bytes) =>
            Service.UploadAsync(new(name, contentType, bytes.LongLength,
                new MemoryStream(bytes, writable: false)), default);

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }
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

        public Task<bool> HasPermissionAsync(Guid userId, string permissionCode,
            CancellationToken cancellationToken) =>
            Task.FromResult(permissions.TryGetValue(userId, out var values) &&
                            values.Contains(permissionCode));
    }

    private sealed class FakeStorage : IObjectStorage
    {
        public Dictionary<string, byte[]> Objects { get; } = new(StringComparer.Ordinal);
        public List<string> UploadedPaths { get; } = [];
        public List<string> DownloadedPaths { get; } = [];
        public List<string> DeletedPaths { get; } = [];
        public bool FailUploadAfterWrite { get; set; }

        public async Task<string> UploadAsync(string containerName, string objectName, Stream content,
            string contentType, CancellationToken cancellationToken)
        {
            UploadedPaths.Add(objectName);
            using var destination = new MemoryStream();
            var buffer = new byte[7];
            while (true)
            {
                var read = await content.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }
            Objects[objectName] = destination.ToArray();
            if (FailUploadAfterWrite) throw new IOException("Simulated provider failure.");
            return objectName;
        }

        public Task<Stream> DownloadAsync(string containerName, string objectName,
            CancellationToken cancellationToken)
        {
            DownloadedPaths.Add(objectName);
            if (!Objects.TryGetValue(objectName, out var content))
                throw new FileNotFoundException("Object not found.", objectName);
            return Task.FromResult<Stream>(new MemoryStream(content, writable: false));
        }

        public Task DeleteAsync(string containerName, string objectName,
            CancellationToken cancellationToken)
        {
            DeletedPaths.Add(objectName);
            Objects.Remove(objectName);
            return Task.CompletedTask;
        }
    }
}
