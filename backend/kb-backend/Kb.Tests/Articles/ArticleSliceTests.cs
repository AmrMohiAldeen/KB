using System.Reflection;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Articles;
using Kb.Application.Authorization;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Articles;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Articles;

public sealed class ArticleSliceTests
{
    [Fact]
    public async Task Creation_creates_initial_draft_uses_authenticated_owner_and_audits()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate);

        var article = await f.Service.CreateAsync(new("  First Article  ", f.CategoryId, null), default);

        Assert.Equal(("First Article", "first-article", ArticleStatuses.Draft),
            (article.Title, article.Slug, article.Status));
        Assert.Equal(f.AuthorId, article.Owner.Id);
        Assert.NotNull(article.CurrentDraft);
        Assert.Equal(f.AuthorId, article.CurrentDraft!.CreatedBy.Id);
        Assert.Equal(string.Empty, article.CurrentDraft.ContentJsonPath);
        Assert.NotEmpty(article.CurrentDraft.RowVersion);
        var stored = await f.Context.Articles.SingleAsync(item => item.ArticleId == article.Id);
        Assert.Equal(article.CurrentDraft.Id, stored.CurrentDraftIdFk);
        Assert.Single(await f.Context.ArticleDrafts.Where(draft => draft.ArticleIdFk == article.Id).ToListAsync());
        var audit = await f.Context.ArticleAuditLogs.SingleAsync(log => log.ActionType == ArticleAuditActions.Created);
        Assert.Equal((article.Id, f.AuthorId, ArticleAuditEntityTypes.Article),
            (audit.ArticleIdFk, audit.ActorIdFk, audit.EntityType));
    }

    [Fact]
    public async Task Creation_rejects_invalid_category_and_allocates_duplicate_slug_suffixes()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            f.Service.CreateAsync(new("Invalid", Guid.NewGuid(), null), default));

        var first = await f.Service.CreateAsync(new("Duplicate", f.CategoryId, " Shared Slug "), default);
        var second = await f.Service.CreateAsync(new("Duplicate Again", f.CategoryId, "shared-slug"), default);
        Assert.Equal("shared-slug", first.Slug);
        Assert.Equal("shared-slug-2", second.Slug);
    }

    [Fact]
    public async Task Viewer_cannot_create_or_update_and_author_cannot_update_another_authors_article()
    {
        await using var f = await Fixture.CreateAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            f.Service.CreateAsync(new("Viewer Attempt", f.CategoryId, null), default));

        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesEditOwnDraft);
        var article = await f.Service.CreateAsync(new("Owned", f.CategoryId, null), default);
        f.Current.UserId = f.OtherUserId;
        var command = new UpdateArticleCommand("Changed", f.CategoryId, null, article.CurrentDraft!.RowVersion);
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.UpdateAsync(article.Id, command, default));

        f.Grant(f.OtherUserId, PermissionCodes.ArticlesEditOwnDraft);
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Service.UpdateAsync(article.Id, command, default));
    }

    [Fact]
    public async Task Author_updates_own_article_and_admin_updates_and_deletes_another_users_article()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesEditOwnDraft);
        var article = await f.Service.CreateAsync(new("Original", f.CategoryId, null), default);

        var ownUpdate = await f.Service.UpdateAsync(article.Id,
            new("Author Update", f.OtherCategoryId, "author-slug", article.CurrentDraft!.RowVersion), default);
        Assert.Equal(("Author Update", "author-slug", f.OtherCategoryId),
            (ownUpdate.Title, ownUpdate.Slug, ownUpdate.Category!.Id));

        f.Current.UserId = f.OtherUserId;
        f.Grant(f.OtherUserId, PermissionCodes.ArticlesEditAnyDraft, PermissionCodes.ArticlesDelete);
        var adminUpdate = await f.Service.UpdateAsync(article.Id,
            new("Admin Update", f.CategoryId, null, ownUpdate.CurrentDraft!.RowVersion), default);
        Assert.Equal("Admin Update", adminUpdate.Title);
        await f.Service.DeleteAsync(article.Id, default);
        await f.Service.DeleteAsync(article.Id, default);

        var stored = await f.Context.Articles.IgnoreQueryFilters().SingleAsync(item => item.ArticleId == article.Id);
        Assert.Equal(ArticleStatuses.Deleted, stored.Status);
        Assert.NotNull(stored.DeletedAt);
        Assert.Single(await f.Context.ArticleAuditLogs.Where(log => log.ActionType == ArticleAuditActions.Deleted).ToListAsync());
    }

    [Fact]
    public async Task Deleted_articles_are_excluded_from_list_and_details()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesDelete);
        var article = await f.Service.CreateAsync(new("Delete Me", f.CategoryId, null), default);
        await f.Service.DeleteAsync(article.Id, default);

        var page = await f.Service.GetPagedAsync(null, null, null, null, 1, 20, null, null, default);
        Assert.DoesNotContain(page.Items, item => item.Id == article.Id);
        await Assert.ThrowsAsync<NotFoundException>(() => f.Service.GetAsync(article.Id, default));
    }

    [Fact]
    public async Task Pagination_search_category_status_owner_and_sorting_are_database_side()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate);
        _ = await f.Service.CreateAsync(new("Zulu Guide", f.CategoryId, null), default);
        _ = await f.Service.CreateAsync(new("Alpha Guide", f.CategoryId, null), default);
        _ = await f.Service.CreateAsync(new("Other", f.OtherCategoryId, null), default);

        var first = await f.Service.GetPagedAsync("Guide", f.CategoryId, ArticleStatuses.Draft, f.AuthorId,
            1, 1, "title", "asc", default);
        var second = await f.Service.GetPagedAsync("Guide", f.CategoryId, ArticleStatuses.Draft, f.AuthorId,
            2, 1, "title", "asc", default);

        Assert.Equal(2, first.TotalCount);
        Assert.Equal("Alpha Guide", first.Items.Single().Title);
        Assert.Equal("Zulu Guide", second.Items.Single().Title);
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            f.Service.GetPagedAsync(null, null, null, null, 1, 101, null, null, default));
    }

    [Fact]
    public async Task Stale_draft_row_version_does_not_overwrite_metadata()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesEditOwnDraft);
        var article = await f.Service.CreateAsync(new("Original", f.CategoryId, null), default);
        var stale = article.CurrentDraft!.RowVersion.ToArray();
        var replacement = Guid.NewGuid().ToByteArray();
        await f.Context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE ARTICLE_DRAFTS SET RowVersion = {replacement} WHERE DraftID = {article.CurrentDraft.Id}");
        f.Context.ChangeTracker.Clear();

        await Assert.ThrowsAsync<ConcurrencyConflictException>(() => f.Service.UpdateAsync(article.Id,
            new("Should Not Win", f.CategoryId, null, stale), default));
        Assert.Equal("Original", (await f.Context.Articles.AsNoTracking().SingleAsync(item => item.ArticleId == article.Id)).Title);
    }

    [Fact]
    public async Task Creation_rolls_back_article_when_initial_draft_insert_fails()
    {
        await using var f = await Fixture.CreateAsync();
        f.Grant(f.AuthorId, PermissionCodes.ArticlesCreate);
        await f.Context.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER fail_initial_draft BEFORE INSERT ON ARTICLE_DRAFTS
            BEGIN SELECT RAISE(ABORT, 'draft failure'); END;
            """);

        await Assert.ThrowsAsync<SqliteException>(() =>
            f.Service.CreateAsync(new("Atomic", f.CategoryId, null), default));
        Assert.Empty(await f.Context.Articles.AsNoTracking().ToListAsync());
        Assert.Empty(await f.Context.ArticleAuditLogs.AsNoTracking().ToListAsync());
    }

    [Fact]
    public void Controller_applies_global_create_and_delete_policies_while_update_is_resource_checked()
    {
        Assert.NotNull(typeof(ArticlesController).GetCustomAttribute<AuthorizeAttribute>());
        Assert.Equal(PermissionPolicy.For(PermissionCodes.ArticlesCreate),
            typeof(ArticlesController).GetMethod("Create")!.GetCustomAttribute<AuthorizeAttribute>()!.Policy);
        Assert.Equal(PermissionPolicy.For(PermissionCodes.ArticlesDelete),
            typeof(ArticlesController).GetMethod("Delete")!.GetCustomAttribute<AuthorizeAttribute>()!.Policy);
        Assert.Null(typeof(ArticlesController).GetMethod("Update")!.GetCustomAttribute<AuthorizeAttribute>());
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly FakePermissionChecker permissions;
        public KbDbContext Context { get; }
        public ArticleService Service { get; }
        public MutableCurrentUser Current { get; }
        public Guid AuthorId { get; }
        public Guid OtherUserId { get; }
        public Guid CategoryId { get; }
        public Guid OtherCategoryId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, ArticleService service,
            MutableCurrentUser current, FakePermissionChecker permissions, Guid authorId, Guid otherUserId,
            Guid categoryId, Guid otherCategoryId) =>
            (this.connection, Context, Service, Current, this.permissions, AuthorId, OtherUserId, CategoryId,
                OtherCategoryId) = (connection, context, service, current, permissions, authorId, otherUserId,
                categoryId, otherCategoryId);

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var authorId = Guid.NewGuid();
            var otherUserId = Guid.NewGuid();
            var categoryId = Guid.NewGuid();
            var otherCategoryId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            context.Users.AddRange(User(authorId, "Author", now), User(otherUserId, "Admin", now));
            context.Categories.AddRange(Category(categoryId, "Guides"), Category(otherCategoryId, "Reference"));
            await context.SaveChangesAsync();
            var current = new MutableCurrentUser { UserId = authorId };
            var permissions = new FakePermissionChecker();
            var service = new ArticleService(new ArticleRepository(context), new SlugGenerator(), current,
                permissions, TimeProvider.System);
            return new(connection, context, service, current, permissions, authorId, otherUserId,
                categoryId, otherCategoryId);
        }

        public void Grant(Guid userId, params string[] permissionCodes) => permissions.Grant(userId, permissionCodes);

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static User User(Guid id, string name, DateTime now) => new()
        {
            UserId = id, Email = $"{id}@example.test", FullName = name, IsActive = true, CreatedAt = now
        };

        private static Category Category(Guid id, string name) => new()
        {
            CategoryId = id, Name = name, Slug = name.ToLowerInvariant(), SortOrder = 0, Depth = 0,
            Path = $"/{id:D}/"
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

        public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken) =>
            Task.FromResult(permissions.TryGetValue(userId, out var values) && values.Contains(permissionCode));
    }
}
