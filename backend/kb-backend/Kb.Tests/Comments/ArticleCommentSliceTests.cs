using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Comments;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Comments;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Comments;

public sealed class ArticleCommentSliceTests
{
    [Fact]
    public async Task Article_block_and_inline_threads_preserve_draft_lineage_replies_and_ordering()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.CommentsCreate);

        var articleLevel = await f.Service.CreateAsync(f.ArticleId,
            new("Article note", f.DraftId, null, null), default);
        var inline = await f.Service.CreateAsync(f.ArticleId,
            new("Inline note", f.DraftId, "TextRange", Json("""
                {"from":1,"to":7,"selectedText":"target","prefix":"","suffix":" text"}
                """)), default);
        var reply = await f.Service.ReplyAsync(f.ArticleId, inline.CommentId, "Reply", default);

        var listed = await f.Service.ListAsync(f.ArticleId, default);
        Assert.Equal(new[] { articleLevel.CommentId, inline.CommentId, reply.CommentId },
            listed.Comments.Select(comment => comment.CommentId));
        Assert.Null(articleLevel.AnchorType);
        Assert.Equal(f.DraftId, articleLevel.CurrentDraftId);
        Assert.Equal(f.DraftId, inline.CurrentDraftId);
        Assert.Equal(f.DraftId, inline.OriginDraftId);
        Assert.Equal(inline.CommentId, reply.ParentCommentId);
        Assert.Null(reply.CurrentDraftId);
    }

    [Fact]
    public async Task Viewers_cannot_mutate_and_only_explicit_moderators_can_change_other_users_comments()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.CommentsCreate);
        var comment = await f.Service.CreateAsync(f.ArticleId, new("Owner body", null, null, null), default);

        f.Current.UserId = f.ViewerId;
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            f.Service.CreateAsync(f.ArticleId, new("Viewer", null, null, null), default));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            f.Service.UpdateAsync(f.ArticleId, comment.CommentId, "Changed", comment.RowVersion, default));

        f.Grant(f.ViewerId, PermissionCodes.CommentsModerate);
        var moderated = await f.Service.UpdateAsync(
            f.ArticleId, comment.CommentId, "Moderated", comment.RowVersion, default);
        Assert.Equal("Moderated", moderated.Body);
        Assert.Contains(await f.Context.ArticleAuditLogs.AsNoTracking().ToListAsync(),
            log => log.ActionType == ArticleAuditActions.CommentUpdated &&
                   log.ActorIdFk == f.ViewerId &&
                   log.EntityId == comment.CommentId);
    }

    [Fact]
    public async Task Resolve_reopen_and_edit_use_row_version_concurrency_and_audit()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.CommentsCreate);
        var comment = await f.Service.CreateAsync(f.ArticleId, new("Thread", null, null, null), default);
        var reply = await f.Service.ReplyAsync(f.ArticleId, comment.CommentId, "Reply", default);
        var resolved = await f.Service.ResolveAsync(f.ArticleId, comment.CommentId, comment.RowVersion, default);

        Assert.Equal(CommentThreadStatuses.Resolved, resolved.Status);
        await Assert.ThrowsAsync<ConcurrencyConflictException>(() =>
            f.Service.ReopenAsync(f.ArticleId, comment.CommentId, comment.RowVersion, default));
        await Assert.ThrowsAsync<ConflictException>(() =>
            f.Service.UpdateAsync(f.ArticleId, comment.CommentId, "Late edit", resolved.RowVersion, default));
        await Assert.ThrowsAsync<ConflictException>(() =>
            f.Service.UpdateAsync(f.ArticleId, reply.CommentId, "Late reply edit", reply.RowVersion, default));

        var reopened = await f.Service.ReopenAsync(f.ArticleId, comment.CommentId, resolved.RowVersion, default);
        Assert.Equal(CommentThreadStatuses.Open, reopened.Status);
        var actions = await f.Context.ArticleAuditLogs.AsNoTracking()
            .Where(log => log.EntityId == comment.CommentId)
            .Select(log => log.ActionType)
            .ToListAsync();
        Assert.Contains(ArticleAuditActions.CommentResolved, actions);
        Assert.Contains(ArticleAuditActions.CommentReopened, actions);
    }

    [Fact]
    public async Task Anchor_remapping_attaches_only_unique_safe_matches_and_marks_stale_anchors()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.CommentsCreate);
        var unique = await f.Service.CreateAsync(f.ArticleId,
            new("Unique", f.DraftId, "TextRange",
                Json("""{"from":1,"to":7,"selectedText":"target","prefix":"","suffix":" text"}""")), default);
        var ambiguous = await f.Service.CreateAsync(f.ArticleId,
            new("Ambiguous", f.DraftId, "TextRange",
                Json("""{"from":1,"to":7,"selectedText":"repeat"}""")), default);
        var missing = await f.Service.CreateAsync(f.ArticleId,
            new("Missing", f.DraftId, "Block",
                Json("""{"position":0,"nodeType":"paragraph","text":"gone"}""")), default);

        await f.Service.RemapAnchorsAsync(f.ArticleId, f.DraftId, Tiptap("prefix target text repeat repeat"),
            default);
        var listed = await f.Service.ListAsync(f.ArticleId, default);

        Assert.Equal(CommentAnchorStatuses.Attached,
            listed.Comments.Single(comment => comment.CommentId == unique.CommentId).AnchorStatus);
        Assert.Equal(CommentAnchorStatuses.NeedsReanchoring,
            listed.Comments.Single(comment => comment.CommentId == ambiguous.CommentId).AnchorStatus);
        Assert.Equal(CommentAnchorStatuses.Orphaned,
            listed.Comments.Single(comment => comment.CommentId == missing.CommentId).AnchorStatus);
    }

    [Fact]
    public async Task Unresolved_threads_block_draft_deletion_dependency_until_resolved()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.CommentsCreate);
        var comment = await f.Service.CreateAsync(f.ArticleId,
            new("Depends on draft", f.DraftId, "Block",
                Json("""{"position":0,"nodeType":"paragraph","text":"target text"}""")), default);

        Assert.True(await f.Service.HasUnresolvedDraftDependenciesAsync(f.DraftId, default));
        await f.Service.ResolveAsync(f.ArticleId, comment.CommentId, comment.RowVersion, default);
        Assert.False(await f.Service.HasUnresolvedDraftDependenciesAsync(f.DraftId, default));
    }

    private static JsonElement Json(string value)
    {
        using var document = JsonDocument.Parse(value);
        return document.RootElement.Clone();
    }

    private static JsonElement Tiptap(string text) => Json(JsonSerializer.Serialize(new
    {
        type = "doc",
        content = new[] { new { type = "paragraph", content = new[] { new { type = "text", text } } } }
    }));

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly FakePermissionChecker permissions;
        public KbDbContext Context { get; }
        public ArticleCommentService Service { get; }
        public MutableCurrentUser Current { get; }
        public Guid ArticleId { get; }
        public Guid DraftId { get; }
        public Guid AuthorId { get; }
        public Guid ViewerId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, ArticleCommentService service,
            MutableCurrentUser current, FakePermissionChecker permissions, Guid articleId, Guid draftId,
            Guid authorId, Guid viewerId) =>
            (this.connection, Context, Service, Current, this.permissions, ArticleId, DraftId, AuthorId, ViewerId) =
            (connection, context, service, current, permissions, articleId, draftId, authorId, viewerId);

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var authorId = Guid.NewGuid();
            var viewerId = Guid.NewGuid();
            var articleId = Guid.NewGuid();
            var draftId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            context.Users.AddRange(User(authorId, "Author", now), User(viewerId, "Viewer", now));
            context.Articles.Add(new Article
            {
                ArticleId = articleId,
                Title = "Comments",
                Slug = $"comments-{articleId:N}",
                AuthorIdFk = authorId,
                Status = ArticleStatuses.Draft,
                CreatedAt = now,
                UpdatedAt = now
            });
            await context.SaveChangesAsync();
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLE_DRAFTS
                    (DraftID, ArticleID_FK, ContentJsonStoragePath, ContentSizeBytes, RowVersion,
                     IsLocked, CreatedBy_FK, CreatedAt, UpdatedAt, Status)
                VALUES ({draftId}, {articleId}, {""}, {0L}, {Guid.NewGuid().ToByteArray()},
                        {false}, {authorId}, {now}, {now}, {ArticleStatuses.Draft})
                """);
            await context.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ARTICLES SET CurrentDraftID_FK = {draftId} WHERE ArticleID = {articleId}");
            context.ChangeTracker.Clear();
            var current = new MutableCurrentUser { UserId = authorId };
            var permissions = new FakePermissionChecker();
            var service = new ArticleCommentService(
                new ArticleCommentRepository(context), current, permissions, TimeProvider.System);
            return new(connection, context, service, current, permissions, articleId, draftId, authorId, viewerId);
        }

        public void Grant(Guid userId, params string[] values) => permissions.Grant(userId, values);

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
        private readonly Dictionary<Guid, HashSet<string>> values = [];
        public void Grant(Guid id, IEnumerable<string> permissions)
        {
            if (!values.TryGetValue(id, out var current))
                values[id] = current = new(StringComparer.Ordinal);
            current.UnionWith(permissions);
        }

        public Task<bool> HasPermissionAsync(Guid id, string permission, CancellationToken cancellationToken) =>
            Task.FromResult(values.TryGetValue(id, out var current) && current.Contains(permission));
    }
}
