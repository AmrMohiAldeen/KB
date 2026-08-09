using System.Reflection;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Authorization;
using Kb.Application.Dashboard;
using Kb.Application.Categories;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Dashboard;
using Kb.Infrastructure.Authorization;
using Kb.Infrastructure.Categories;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Kb.Infrastructure.Services;

namespace Kb.Tests.Dashboard;

public sealed class DashboardSliceTests
{
    [Fact]
    public async Task Position_sort_keeps_direct_child_categories_before_articles_stably()
    {
        await using var fixture = await Fixture.CreateAsync();
        var result = await fixture.Service.GetAsync(
            null, fixture.RootCategoryId, "Everything", "position", 1, 100, default);

        Assert.Equal(3, result.TotalCount);
        Assert.Equal(2, result.ArticleCount);
        Assert.Equal(
            new[] { "category:Child", "article:First", "article:Second" },
            result.Items.Select(item => $"{item.Kind}:{item.Title}"));
        Assert.DoesNotContain(result.Items, item => item.Title == "Grandchild");
    }

    [Fact]
    public async Task Grouped_filters_counts_archives_and_pagination_are_returned_by_one_query()
    {
        await using var fixture = await Fixture.CreateAsync();

        var review = await fixture.Service.GetAsync(
            null, null, "ToReview", "title", 1, 2, default);
        Assert.Equal(3, review.EverythingArticleCount);
        Assert.Equal(1, review.ArticleCount);
        Assert.Equal(1, review.FilterCounts.Published);
        Assert.Equal(2, review.FilterCounts.DraftUnpublished);
        Assert.Equal(1, review.FilterCounts.ToReview);
        Assert.Equal(1, review.FilterCounts.Archived);
        Assert.Equal(5, review.TotalCount);
        Assert.True(review.Truncated);
        Assert.Equal(2, review.Items.Count);

        var archived = await fixture.Service.GetAsync(
            "Archived", null, "Archived", "position", 1, 100, default);
        var archivedArticle = Assert.Single(archived.Items, item => item.Kind == "article");
        Assert.Equal(ArticleStatuses.Archived, archivedArticle.Article!.Status);
        Assert.Equal(1, archived.ArticleCount);
        Assert.Equal(0, archived.EverythingArticleCount);
    }

    [Fact]
    public async Task Missing_category_and_invalid_query_values_are_rejected()
    {
        await using var fixture = await Fixture.CreateAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => fixture.Service.GetAsync(
            null, Guid.NewGuid(), "Everything", "position", 1, 100, default));
        await Assert.ThrowsAsync<BusinessRuleException>(() => fixture.Service.GetAsync(
            null, null, "Unknown", "position", 1, 100, default));
        await Assert.ThrowsAsync<BusinessRuleException>(() => fixture.Service.GetAsync(
            null, null, "Everything", "unknown", 1, 100, default));
    }

    [Fact]
    public async Task Reorder_persists_within_each_group_and_audits_changes()
    {
        await using var fixture = await Fixture.CreateAsync();
        var child = await fixture.Context.Categories.SingleAsync(category => category.Name == "Child");
        var sibling = Fixture.CreateCategory(Guid.NewGuid(), fixture.RootCategoryId, "Sibling", 8, 1);
        fixture.Context.Categories.Add(sibling);
        await fixture.Context.SaveChangesAsync();
        var first = await fixture.Context.Articles.SingleAsync(article => article.Title == "First");
        var second = await fixture.Context.Articles.SingleAsync(article => article.Title == "Second");

        await fixture.Service.ReorderCategoryAsync(sibling.CategoryId, child.CategoryId, "before", default);
        await fixture.Service.ReorderArticleAsync(second.ArticleId, first.ArticleId, "before", default);
        fixture.Context.ChangeTracker.Clear();

        var result = await fixture.Service.GetAsync(
            null, fixture.RootCategoryId, "Everything", "position", 1, 100, default);
        Assert.Equal(
            new[] { "category:Sibling", "category:Child", "article:Second", "article:First" },
            result.Items.Select(item => $"{item.Kind}:{item.Title}"));
        Assert.Contains(await fixture.Context.ArticleAuditLogs.ToListAsync(),
            audit => audit.ActionType == CategoryAuditActions.Reordered);
        Assert.Contains(await fixture.Context.ArticleAuditLogs.ToListAsync(),
            audit => audit.ActionType == ArticleAuditActions.Reordered);
    }

    [Fact]
    public void Reorder_endpoints_require_group_management_permissions()
    {
        var category = typeof(DashboardController).GetMethod("ReorderCategory")!
            .GetCustomAttribute<AuthorizeAttribute>();
        var article = typeof(DashboardController).GetMethod("ReorderArticle")!
            .GetCustomAttribute<AuthorizeAttribute>();

        Assert.Equal(PermissionPolicy.For(PermissionCodes.CategoriesManage), category!.Policy);
        Assert.Equal(PermissionPolicy.For(PermissionCodes.ArticlesEditAnyDraft), article!.Policy);
    }

    [Fact]
    public async Task Bulk_category_move_enforces_permission_in_the_application_layer()
    {
        await using var fixture = await Fixture.CreateAsync();
        var child = await fixture.Context.Categories.SingleAsync(category => category.Name == "Child");
        var destination = await fixture.Context.Categories.SingleAsync(category => category.Name == "Other");

        await Assert.ThrowsAsync<ForbiddenException>(() => fixture.CreateBulkService().MoveAsync(
            [], [child.CategoryId], destination.CategoryId, default));
    }

    [Fact]
    public async Task Bulk_category_move_preserves_selected_descendants_and_rejects_cycles()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.GrantAsync(PermissionCodes.CategoriesManage);
        var root = await fixture.Context.Categories.SingleAsync(category => category.Name == "Root");
        var child = await fixture.Context.Categories.SingleAsync(category => category.Name == "Child");
        var grandchild = await fixture.Context.Categories.SingleAsync(category => category.Name == "Grandchild");
        var destination = await fixture.Context.Categories.SingleAsync(category => category.Name == "Other");
        root.Path = $"/{root.CategoryId:D}/";
        child.Path = $"{root.Path}{child.CategoryId:D}/";
        grandchild.Path = $"{child.Path}{grandchild.CategoryId:D}/";
        destination.Path = $"/{destination.CategoryId:D}/";
        await fixture.Context.SaveChangesAsync();

        await Assert.ThrowsAsync<ConflictException>(() => fixture.CreateBulkService().MoveAsync(
            [], [root.CategoryId], grandchild.CategoryId, default));

        var result = await fixture.CreateBulkService().MoveAsync(
            [], [child.CategoryId, grandchild.CategoryId], destination.CategoryId, default);
        fixture.Context.ChangeTracker.Clear();

        Assert.Equal([child.CategoryId], result.CategoryIds);
        var movedChild = await fixture.Context.Categories.SingleAsync(value => value.CategoryId == child.CategoryId);
        var movedGrandchild = await fixture.Context.Categories.SingleAsync(value => value.CategoryId == grandchild.CategoryId);
        Assert.Equal(destination.CategoryId, movedChild.ParentCategoryIdFk);
        Assert.Equal(child.CategoryId, movedGrandchild.ParentCategoryIdFk);
        Assert.StartsWith(movedChild.Path, movedGrandchild.Path);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public DashboardService Service { get; }
        public Guid RootCategoryId { get; }
        public Guid UserId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, Guid rootCategoryId, Guid userId)
        {
            this.connection = connection;
            Context = context;
            RootCategoryId = rootCategoryId;
            UserId = userId;
            Service = new DashboardService(new DashboardRepository(context), new CurrentUser(userId), TimeProvider.System);
        }

        public DashboardBulkService CreateBulkService()
        {
            var current = new CurrentUser(UserId);
            var categoryService = new CategoryService(new CategoryRepository(Context), new SlugGenerator(),
                current, TimeProvider.System, NullLogger<CategoryService>.Instance);
            return new DashboardBulkService(new DashboardRepository(Context), categoryService, null!, null!,
                current, new DatabasePermissionChecker(Context), TimeProvider.System);
        }

        public async Task GrantAsync(string permission)
        {
            var roleId = Guid.NewGuid();
            Context.Roles.Add(new Role { RoleId = roleId, RoleName = $"Bulk {permission}" });
            Context.RolePermissions.Add(new RolePermission { RoleIdFk = roleId, PermissionCode = permission });
            Context.UserRoles.Add(new UserRole { UserId = UserId, RoleId = roleId, AssignedAt = DateTime.UtcNow });
            await Context.SaveChangesAsync();
        }

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();

            var now = DateTime.UtcNow;
            var userId = Guid.NewGuid();
            var rootId = Guid.NewGuid();
            var childId = Guid.NewGuid();
            var grandchildId = Guid.NewGuid();
            var otherRootId = Guid.NewGuid();
            context.Users.Add(new User
            {
                UserId = userId,
                Email = "dashboard@example.test",
                FullName = "Dashboard User",
                IsActive = true,
                CreatedAt = now
            });
            context.Categories.AddRange(
                CreateCategory(rootId, null, "Root", 0, 0),
                CreateCategory(childId, rootId, "Child", 2, 1),
                CreateCategory(grandchildId, childId, "Grandchild", 0, 2),
                CreateCategory(otherRootId, null, "Other", 3, 0));
            context.Articles.AddRange(
                Article(userId, rootId, "First", ArticleStatuses.Draft, 1, now.AddMinutes(-4)),
                Article(userId, rootId, "Second", ArticleStatuses.Published, 4, now.AddMinutes(-3)),
                Article(userId, otherRootId, "Review", ArticleStatuses.InReview, 0, now.AddMinutes(-2)),
                Article(userId, otherRootId, "Archived", ArticleStatuses.Archived, 1, now.AddMinutes(-1)));
            await context.SaveChangesAsync();
            return new(connection, context, rootId, userId);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }

        public static Category CreateCategory(Guid id, Guid? parentId, string name, int sortOrder, int depth) => new()
        {
            CategoryId = id,
            ParentCategoryIdFk = parentId,
            Name = name,
            Slug = name.ToLowerInvariant(),
            SortOrder = sortOrder,
            Depth = depth,
            Path = $"/{id:D}/"
        };

        private static Article Article(
            Guid userId,
            Guid categoryId,
            string title,
            string status,
            int position,
            DateTime updatedAt) => new()
        {
            ArticleId = Guid.NewGuid(),
            Title = title,
            Slug = title.ToLowerInvariant(),
            CategoryIdFk = categoryId,
            AuthorIdFk = userId,
            Status = status,
            Position = position,
            CreatedAt = updatedAt,
            UpdatedAt = updatedAt
        };

        private sealed class CurrentUser(Guid userId) : ICurrentUser
        {
            public bool IsAuthenticated => true;
            public Guid UserId => userId;
            public string? Email => "dashboard@example.test";
        }
    }
}
