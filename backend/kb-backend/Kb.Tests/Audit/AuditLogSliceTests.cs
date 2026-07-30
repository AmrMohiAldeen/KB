using System.Reflection;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Audit;
using Kb.Application.Authorization;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Audit;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Audit;

public sealed class AuditLogSliceTests
{
    [Fact]
    public async Task Viewing_requires_authentication_and_audit_permission()
    {
        await using var fixture = await Fixture.CreateAsync();

        fixture.Current.IsAuthenticated = false;
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => fixture.Service.GetPagedAsync(
            null, null, null, null, null, null, null, 1, 20, "desc", default));

        fixture.Current.IsAuthenticated = true;
        await Assert.ThrowsAsync<ForbiddenException>(() => fixture.Service.GetPagedAsync(
            null, null, null, null, null, null, null, 1, 20, "desc", default));

        fixture.Permissions.Grant(fixture.UserOneId, PermissionCodes.AuditLogsView);
        var result = await fixture.Service.GetPagedAsync(
            null, null, null, null, null, null, null, 1, 20, "desc", default);

        Assert.Equal(4, result.TotalCount);
    }

    [Fact]
    public void Endpoint_uses_the_existing_audit_log_permission_and_exposes_no_mutation_actions()
    {
        var controller = typeof(AuditLogsController);
        var methods = controller.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);
        var get = Assert.Single(methods, method => method.Name == "GetList");

        Assert.NotNull(controller.GetCustomAttribute<AuthorizeAttribute>());
        Assert.Equal(
            PermissionPolicy.Prefix + PermissionCodes.AuditLogsView,
            get.GetCustomAttribute<AuthorizeAttribute>()!.Policy);
        Assert.Single(methods);
    }

    [Fact]
    public async Task Filters_by_article_user_action_and_inclusive_date_range()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Permissions.Grant(fixture.UserOneId, PermissionCodes.AuditLogsView);

        var articleAndUser = await fixture.Service.GetPagedAsync(
            fixture.ArticleOneId, fixture.UserOneId, null, null, null, null, null, 1, 20, "desc", default);
        Assert.Equal(
            new[] { ArticleAuditActions.DraftContentSaved, ArticleAuditActions.Created },
            articleAndUser.Items.Select(item => item.ActionType));

        var displayFilters = await fixture.Service.GetPagedAsync(
            null, null, "Second", "Reviewer", null, null, null, 1, 20, "desc", default);
        Assert.Equal(ArticleAuditActions.Published, Assert.Single(displayFilters.Items).ActionType);

        var action = await fixture.Service.GetPagedAsync(
            null, null, null, null, ArticleAuditActions.Published, null, null, 1, 20, "desc", default);
        var published = Assert.Single(action.Items);
        Assert.Equal(fixture.ArticleTwoId, published.ArticleId);
        Assert.Equal("Second Article", published.Article!.Title);
        Assert.Equal("Reviewer", published.Actor!.Name);

        var ranged = await fixture.Service.GetPagedAsync(
            null, null, null, null, null,
            new DateTimeOffset(fixture.BaseTime.AddMinutes(1), TimeSpan.Zero),
            new DateTimeOffset(fixture.BaseTime.AddMinutes(2), TimeSpan.Zero),
            1, 20, "asc", default);
        Assert.Equal(
            new[] { ArticleAuditActions.DraftContentSaved, ArticleAuditActions.Published },
            ranged.Items.Select(item => item.ActionType));
    }

    [Fact]
    public async Task Pagination_is_stably_ordered_newest_first()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Permissions.Grant(fixture.UserOneId, PermissionCodes.AuditLogsView);

        var first = await fixture.Service.GetPagedAsync(
            null, null, null, null, null, null, null, 1, 2, "desc", default);
        var second = await fixture.Service.GetPagedAsync(
            null, null, null, null, null, null, null, 2, 2, "desc", default);

        Assert.Equal(4, first.TotalCount);
        Assert.Equal(
            new[] { CategoryAuditActions.Updated, ArticleAuditActions.Published },
            first.Items.Select(item => item.ActionType));
        Assert.Equal(
            new[] { ArticleAuditActions.DraftContentSaved, ArticleAuditActions.Created },
            second.Items.Select(item => item.ActionType));
        Assert.True(first.Items[^1].CreatedAt > second.Items[0].CreatedAt);
    }

    [Fact]
    public async Task Invalid_metadata_does_not_break_the_feed()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Permissions.Grant(fixture.UserOneId, PermissionCodes.AuditLogsView);

        var result = await fixture.Service.GetPagedAsync(
            null, null, null, null, CategoryAuditActions.Updated, null, null, 1, 20, "desc", default);

        Assert.Null(Assert.Single(result.Items).Metadata);
    }

    [Fact]
    public async Task Existing_audit_rows_cannot_be_edited_or_deleted()
    {
        await using var fixture = await Fixture.CreateAsync();
        var existing = await fixture.Context.ArticleAuditLogs.FirstAsync();

        existing.ActionType = "Tampered";
        var editError = await Assert.ThrowsAsync<InvalidOperationException>(
            () => fixture.Context.SaveChangesAsync());
        Assert.Contains("append-only", editError.Message);

        fixture.Context.ChangeTracker.Clear();
        existing = await fixture.Context.ArticleAuditLogs.FirstAsync();
        fixture.Context.ArticleAuditLogs.Remove(existing);
        var deleteError = await Assert.ThrowsAsync<InvalidOperationException>(
            () => fixture.Context.SaveChangesAsync());
        Assert.Contains("append-only", deleteError.Message);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;

        private Fixture(
            SqliteConnection connection,
            KbDbContext context,
            AuditLogService service,
            MutableCurrentUser current,
            FakePermissionChecker permissions,
            Guid userOneId,
            Guid articleOneId,
            Guid articleTwoId,
            DateTime baseTime)
        {
            this.connection = connection;
            Context = context;
            Service = service;
            Current = current;
            Permissions = permissions;
            UserOneId = userOneId;
            ArticleOneId = articleOneId;
            ArticleTwoId = articleTwoId;
            BaseTime = baseTime;
        }

        public KbDbContext Context { get; }
        public AuditLogService Service { get; }
        public MutableCurrentUser Current { get; }
        public FakePermissionChecker Permissions { get; }
        public Guid UserOneId { get; }
        public Guid ArticleOneId { get; }
        public Guid ArticleTwoId { get; }
        public DateTime BaseTime { get; }

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(
                new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();

            var userOneId = Guid.NewGuid();
            var userTwoId = Guid.NewGuid();
            var categoryId = Guid.NewGuid();
            var articleOneId = Guid.NewGuid();
            var articleTwoId = Guid.NewGuid();
            var baseTime = new DateTime(2026, 7, 1, 10, 0, 0, DateTimeKind.Utc);

            context.Users.AddRange(
                User(userOneId, "Author", baseTime),
                User(userTwoId, "Reviewer", baseTime));
            context.Categories.Add(new Category
            {
                CategoryId = categoryId,
                Name = "Guides",
                Slug = "guides",
                SortOrder = 0,
                Depth = 0,
                Path = $"/{categoryId:D}/"
            });
            context.Articles.AddRange(
                Article(articleOneId, "First Article", "first", categoryId, userOneId, baseTime),
                Article(articleTwoId, "Second Article", "second", categoryId, userTwoId, baseTime));
            context.ArticleAuditLogs.AddRange(
                Audit(articleOneId, userOneId, ArticleAuditActions.Created, baseTime, """{"title":"First Article"}"""),
                Audit(articleOneId, userOneId, ArticleAuditActions.DraftContentSaved, baseTime.AddMinutes(1), """{"contentSizeBytes":12}"""),
                Audit(articleTwoId, userTwoId, ArticleAuditActions.Published, baseTime.AddMinutes(2), """{"versionNumber":1}"""),
                new ArticleAuditLog
                {
                    AuditLogId = Guid.NewGuid(),
                    ActorIdFk = userOneId,
                    ActionType = CategoryAuditActions.Updated,
                    EntityType = AuditEntityTypes.Category,
                    EntityId = categoryId,
                    MetaDataJson = "{invalid",
                    CreatedAt = baseTime.AddMinutes(3)
                });
            await context.SaveChangesAsync();
            context.ChangeTracker.Clear();

            var current = new MutableCurrentUser { UserId = userOneId };
            var permissions = new FakePermissionChecker();
            var service = new AuditLogService(new AuditLogRepository(context), current, permissions);
            return new(
                connection, context, service, current, permissions,
                userOneId, articleOneId, articleTwoId, baseTime);
        }

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

        private static Article Article(
            Guid id,
            string title,
            string slug,
            Guid categoryId,
            Guid authorId,
            DateTime now) => new()
        {
            ArticleId = id,
            Title = title,
            Slug = slug,
            CategoryIdFk = categoryId,
            AuthorIdFk = authorId,
            Status = ArticleStatuses.Draft,
            CreatedAt = now,
            UpdatedAt = now
        };

        private static ArticleAuditLog Audit(
            Guid articleId,
            Guid actorId,
            string action,
            DateTime createdAt,
            string metadata) => new()
        {
            AuditLogId = Guid.NewGuid(),
            ArticleIdFk = articleId,
            ActorIdFk = actorId,
            ActionType = action,
            EntityType = ArticleAuditEntityTypes.Article,
            EntityId = articleId,
            MetaDataJson = metadata,
            CreatedAt = createdAt
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

        public void Grant(Guid userId, params string[] permissionCodes)
        {
            if (!permissions.TryGetValue(userId, out var current))
                permissions[userId] = current = new(StringComparer.Ordinal);
            current.UnionWith(permissionCodes);
        }

        public Task<bool> HasPermissionAsync(
            Guid userId,
            string permissionCode,
            CancellationToken cancellationToken) =>
            Task.FromResult(
                permissions.TryGetValue(userId, out var current) &&
                current.Contains(permissionCode));
    }
}
