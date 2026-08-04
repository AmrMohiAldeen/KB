using System.Reflection;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Authorization;
using Kb.Application.Categories;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Categories;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Kb.Tests.Categories;

public sealed class CategorySliceTests
{
    [Fact]
    public async Task Creation_builds_paths_unique_slugs_and_audits()
    {
        await using var f = await Fixture.CreateAsync();
        var root = await f.Service.CreateAsync(new(null, " Getting Started ", " Root docs ", 2), default);
        var duplicate = await f.Service.CreateAsync(new(null, "Getting Started", null, 3), default);
        var child = await f.Service.CreateAsync(new(root.Id, "API Guides", null, 0), default);

        Assert.Equal("getting-started", root.Slug);
        Assert.Equal("getting-started-2", duplicate.Slug);
        Assert.True(duplicate.Slug.Length <= 250);
        Assert.Equal($"/{D(root.Id)}/", root.Path);
        Assert.Equal($"/{D(root.Id)}/{D(child.Id)}/", child.Path);
        Assert.Equal(0, root.Depth);
        Assert.Equal(1, child.Depth);
        Assert.Equal("Root docs", root.Description);
        var audits = await f.Context.ArticleAuditLogs.ToListAsync();
        Assert.Equal(3, audits.Count);
        Assert.All(audits, audit =>
        {
            Assert.Null(audit.ArticleIdFk);
            Assert.Equal(AuditEntityTypes.Category, audit.EntityType);
            Assert.Equal(f.UserId, audit.ActorIdFk);
        });
    }

    [Fact]
    public async Task Invalid_creation_does_not_write_an_audit()
    {
        await using var f = await Fixture.CreateAsync();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            f.Service.CreateAsync(new(Guid.NewGuid(), "Child", null, 0), default));
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            f.Service.CreateAsync(new(null, "Category", null, -1), default));
        await Assert.ThrowsAsync<BusinessRuleException>(() =>
            f.Service.CreateAsync(new(null, "   ", null, 0), default));
        Assert.Empty(await f.Context.ArticleAuditLogs.ToListAsync());
    }

    [Fact]
    public async Task Tree_is_deep_ordered_and_safe_with_corrupt_cycles()
    {
        await using var f = await Fixture.CreateAsync();
        _ = await f.Service.CreateAsync(new(null, "Beta", null, 1), default);
        var alpha = await f.Service.CreateAsync(new(null, "Alpha", null, 1), default);
        _ = await f.Service.CreateAsync(new(alpha.Id, "Child B", null, 0), default);
        var childA = await f.Service.CreateAsync(new(alpha.Id, "Child A", null, 0), default);
        var grandchild = await f.Service.CreateAsync(new(childA.Id, "Grandchild", null, 0), default);
        var cycleA = await f.Service.CreateAsync(new(null, "Cycle A", null, 9), default);
        var cycleB = await f.Service.CreateAsync(new(cycleA.Id, "Cycle B", null, 0), default);
        f.Context.ChangeTracker.Clear();
        await f.Context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE CATEGORIES SET ParentCategoryID_FK = {cycleB.Id} WHERE CategoryID = {cycleA.Id}");

        var tree = await f.Service.GetTreeAsync(default);

        Assert.Equal(["Alpha", "Beta"], tree.Select(node => node.Name));
        Assert.Equal(["Child A", "Child B"], tree[0].Children.Select(node => node.Name));
        Assert.Equal(grandchild.Id, tree[0].Children[0].Children.Single().Id);
        Assert.All(tree.SelectMany(Flatten), node => Assert.NotNull(node.Children));
        Assert.DoesNotContain(tree.SelectMany(Flatten), node => node.Id == cycleA.Id || node.Id == cycleB.Id);
        Assert.Empty(f.Context.ChangeTracker.Entries());
    }

    [Fact]
    public async Task Update_preserves_slug_and_hierarchy()
    {
        await using var f = await Fixture.CreateAsync();
        var root = await f.Service.CreateAsync(new(null, "Original", "Before", 1), default);
        var updated = await f.Service.UpdateAsync(root.Id, new(" Renamed ", " After ", 7), default);

        Assert.Equal(("Renamed", "After", 7), (updated.Name, updated.Description, updated.SortOrder));
        Assert.Equal((root.Slug, root.ParentCategoryId, root.Path, root.Depth),
            (updated.Slug, updated.ParentCategoryId, updated.Path, updated.Depth));
        var audit = await f.Context.ArticleAuditLogs.SingleAsync(x => x.ActionType == CategoryAuditActions.Updated);
        Assert.Contains("before", audit.MetaDataJson);
        Assert.Contains("after", audit.MetaDataJson);
    }

    [Fact]
    public async Task Move_updates_subtree_and_rejects_cycles()
    {
        await using var f = await Fixture.CreateAsync();
        var rootA = await f.Service.CreateAsync(new(null, "Root A", null, 0), default);
        var rootB = await f.Service.CreateAsync(new(null, "Root B", null, 0), default);
        var child = await f.Service.CreateAsync(new(rootA.Id, "Child", null, 0), default);
        var grandchild = await f.Service.CreateAsync(new(child.Id, "Grandchild", null, 0), default);

        var moved = await f.Service.MoveAsync(child.Id, new(rootB.Id, 4), default);
        var descendant = await f.Service.GetAsync(grandchild.Id, default);
        Assert.Equal($"/{D(rootB.Id)}/{D(child.Id)}/", moved.Path);
        Assert.Equal(1, moved.Depth);
        Assert.Equal($"{moved.Path}{D(grandchild.Id)}/", descendant!.Path);
        Assert.Equal(2, descendant.Depth);
        Assert.Equal((child.Slug, grandchild.Slug), (moved.Slug, descendant.Slug));
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.MoveAsync(child.Id, new(child.Id, 0), default));
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.MoveAsync(rootB.Id, new(grandchild.Id, 0), default));
        await Assert.ThrowsAsync<NotFoundException>(() => f.Service.MoveAsync(child.Id, new(Guid.NewGuid(), 0), default));

        var rootAgain = await f.Service.MoveAsync(child.Id, new(null, 2), default);
        Assert.Null(rootAgain.ParentCategoryId);
        Assert.Equal($"/{D(child.Id)}/", rootAgain.Path);
        Assert.Equal(2, await f.Context.ArticleAuditLogs.CountAsync(x => x.ActionType == CategoryAuditActions.Moved));
    }

    [Fact]
    public async Task Delete_only_allows_unreferenced_leaves_and_audits_success()
    {
        await using var f = await Fixture.CreateAsync();
        var parent = await f.Service.CreateAsync(new(null, "Parent", null, 0), default);
        var leaf = await f.Service.CreateAsync(new(parent.Id, "Leaf", null, 0), default);
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.DeleteAsync(parent.Id, default));
        await f.AddArticleAsync(leaf.Id, softDeleted: true);
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.DeleteAsync(leaf.Id, default));
        var activeCategory = await f.Service.CreateAsync(new(null, "Active Reference", null, 0), default);
        await f.AddArticleAsync(activeCategory.Id, softDeleted: false);
        await Assert.ThrowsAsync<ConflictException>(() => f.Service.DeleteAsync(activeCategory.Id, default));
        Assert.Equal(0, await f.Context.ArticleAuditLogs.CountAsync(x => x.ActionType == CategoryAuditActions.Deleted));

        var empty = await f.Service.CreateAsync(new(null, "Empty", null, 0), default);
        await f.Service.DeleteAsync(empty.Id, default);
        Assert.Null(await f.Context.Categories.FindAsync(empty.Id));
        Assert.Equal(empty.Id, (await f.Context.ArticleAuditLogs.SingleAsync(
            x => x.ActionType == CategoryAuditActions.Deleted)).EntityId);
    }

    [Fact]
    public void Write_actions_require_manage_and_reads_require_authentication()
    {
        Assert.NotNull(typeof(CategoriesController).GetCustomAttribute<AuthorizeAttribute>());
        foreach (var action in new[] { "Create", "Update", "Move", "Delete" })
        {
            var authorize = typeof(CategoriesController).GetMethod(action)!.GetCustomAttribute<AuthorizeAttribute>();
            Assert.Equal(PermissionPolicy.For(PermissionCodes.CategoriesManage), authorize!.Policy);
        }
    }

    private static IEnumerable<CategoryTreeNode> Flatten(CategoryTreeNode node)
    {
        yield return node;
        foreach (var child in node.Children.SelectMany(Flatten))
            yield return child;
    }

    private static string D(Guid id) => id.ToString("D").ToLowerInvariant();

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public CategoryService Service { get; }
        public Guid UserId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, CategoryService service, Guid userId) =>
            (this.connection, Context, Service, UserId) = (connection, context, service, userId);

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var userId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO USERS (UserID, Email, FullName, IsActive, CreatedAt)
                VALUES ({userId}, {$"{userId}@example.test"}, {"Category Tester"}, {true}, {now})
                """);
            var service = new CategoryService(new CategoryRepository(context), new SlugGenerator(),
                new CurrentUser(userId), TimeProvider.System, NullLogger<CategoryService>.Instance);
            return new(connection, context, service, userId);
        }

        public Task AddArticleAsync(Guid categoryId, bool softDeleted)
        {
            var id = Guid.NewGuid();
            var now = DateTime.UtcNow;
            return Context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO ARTICLES
                    (ArticleID, Title, Slug, CategoryID_FK, AuthorID_FK, Status, CreatedAt, UpdatedAt, DeletedAt)
                VALUES ({id}, {"Article"}, {$"article-{id}"}, {categoryId}, {UserId}, {"Draft"}, {now}, {now},
                    {(softDeleted ? now : (DateTime?)null)})
                """);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class CurrentUser(Guid userId) : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public Guid UserId => userId;
        public string? Email => null;
    }
}
