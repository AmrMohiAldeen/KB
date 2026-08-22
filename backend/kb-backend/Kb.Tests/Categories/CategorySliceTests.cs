using System.Reflection;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Authorization;
using Kb.Application.Categories;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Categories;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Services;
using Kb.Infrastructure.Public;
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
    public async Task Update_can_change_slug_and_preserves_hierarchy()
    {
        await using var f = await Fixture.CreateAsync();
        var root = await f.Service.CreateAsync(new(null, "Original", "Before", 1), default);
        var updated = await f.Service.UpdateAsync(root.Id, new(" Renamed ", " After ", 7, "custom-link"), default);

        Assert.Equal(("Renamed", "After", 7), (updated.Name, updated.Description, updated.SortOrder));
        Assert.Equal("custom-link", updated.Slug);
        Assert.Equal((root.ParentCategoryId, root.Path, root.Depth),
            (updated.ParentCategoryId, updated.Path, updated.Depth));
        var audit = await f.Context.ArticleAuditLogs.SingleAsync(x => x.ActionType == CategoryAuditActions.Updated);
        Assert.Contains("before", audit.MetaDataJson);
        Assert.Contains("after", audit.MetaDataJson);
    }

    [Fact]
    public async Task Viewer_artwork_uses_active_library_images_or_supported_icons()
    {
        await using var f = await Fixture.CreateAsync();
        var imageId = Guid.NewGuid();
        f.Context.MediaFiles.Add(new MediaFile
        {
            MediaId = imageId,
            OriginalFileName = "category.png",
            StoredFileName = "category.png",
            MimeType = "image/png",
            FileExtension = ".png",
            FileSizeBytes = 10,
            StoragePath = "categories/category.png",
            Status = MediaStatuses.Active,
            UploadedByFk = f.UserId,
            UploadedAt = DateTime.UtcNow
        });
        await f.Context.SaveChangesAsync();

        var category = await f.Service.CreateAsync(new(null, "Guides", null, 0, null,
            ContentVisibilities.Public, imageId), default);
        Assert.Equal(imageId, category.ViewerImageMediaId);
        Assert.Null(category.ViewerIcon);

        var updated = await f.Service.UpdateAsync(category.Id, new(category.Name, category.Description,
            category.SortOrder, category.Slug, category.Visibility, null, "rocket"), default);
        Assert.Null(updated.ViewerImageMediaId);
        Assert.Equal("rocket", updated.ViewerIcon);

        await Assert.ThrowsAsync<BusinessRuleException>(() => f.Service.UpdateAsync(category.Id,
            new(category.Name, category.Description, category.SortOrder, category.Slug, category.Visibility,
                imageId, "folder"), default));
        await Assert.ThrowsAsync<BusinessRuleException>(() => f.Service.UpdateAsync(category.Id,
            new(category.Name, category.Description, category.SortOrder, category.Slug, category.Visibility,
                null, "unsupported"), default));
    }

    [Fact]
    public async Task Visibility_change_is_audited_and_internal_ancestor_hides_public_descendants()
    {
        await using var f = await Fixture.CreateAsync();
        var internalRoot = await f.Service.CreateAsync(
            new(null, "Internal root", null, 0, null, ContentVisibilities.Internal), default);
        _ = await f.Service.CreateAsync(
            new(internalRoot.Id, "Marked public child", null, 0, null, ContentVisibilities.Public), default);
        var visibleRoot = await f.Service.CreateAsync(
            new(null, "Visible root", null, 1, null, ContentVisibilities.Public), default);

        var publicCategories = await new PublicKnowledgeBaseRepository(f.Context).GetCategoriesAsync(default);

        Assert.Equal([visibleRoot.Id], publicCategories.Select(category => category.Id));
        var audit = await f.Context.ArticleAuditLogs.SingleAsync(log =>
            log.EntityId == internalRoot.Id && log.ActionType == CategoryAuditActions.Created);
        Assert.Contains("\"visibility\":\"Internal\"", audit.MetaDataJson);

        var changed = await f.Service.UpdateAsync(visibleRoot.Id,
            new(visibleRoot.Name, visibleRoot.Description, visibleRoot.SortOrder, visibleRoot.Slug,
                ContentVisibilities.Internal), default);
        Assert.Equal(ContentVisibilities.Internal, changed.Visibility);
        var visibilityAudit = await f.Context.ArticleAuditLogs.SingleAsync(log =>
            log.EntityId == visibleRoot.Id && log.ActionType == CategoryAuditActions.VisibilityChanged);
        Assert.Contains("\"oldValue\":\"Public\"", visibilityAudit.MetaDataJson);
        Assert.Contains("\"newValue\":\"Internal\"", visibilityAudit.MetaDataJson);
        Assert.Equal(f.UserId, visibilityAudit.ActorIdFk);
    }

    [Fact]
    public async Task Archive_preserves_category_and_contents_and_can_be_reversed()
    {
        await using var f = await Fixture.CreateAsync();
        var category = await f.Service.CreateAsync(new(null, "Keep Me", null, 0), default);
        await f.AddArticleAsync(category.Id, softDeleted: false);

        var archived = await f.Service.SetArchivedAsync(category.Id, true, default);

        Assert.Equal(CategoryStatuses.Archived, archived.Status);
        Assert.NotNull(await f.Context.Categories.FindAsync(category.Id));
        Assert.Equal(1, await f.Context.Articles.CountAsync(article => article.CategoryIdFk == category.Id));

        var restored = await f.Service.SetArchivedAsync(category.Id, false, default);
        Assert.Equal(CategoryStatuses.Active, restored.Status);
        Assert.Equal(1, await f.Context.ArticleAuditLogs.CountAsync(
            audit => audit.ActionType == CategoryAuditActions.Archived));
        Assert.Equal(1, await f.Context.ArticleAuditLogs.CountAsync(
            audit => audit.ActionType == CategoryAuditActions.Unarchived));
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
        foreach (var action in new[] { "Create", "Update", "Move", "Delete", "Archive", "Unarchive" })
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
