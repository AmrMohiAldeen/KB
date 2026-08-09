using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Kb.Application.Notifications;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Notifications;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Notifications;

public sealed class NotificationSliceTests
{
    [Fact]
    public async Task List_and_read_mutations_are_scoped_to_the_authenticated_user()
    {
        await using var fixture = await Fixture.CreateAsync();
        var now = DateTime.UtcNow;
        var ownOne = Notification(fixture.UserId, fixture.ArticleId, "First", now.AddMinutes(-1));
        var ownTwo = Notification(fixture.UserId, fixture.ArticleId, "Second", now);
        var other = Notification(fixture.OtherUserId, fixture.ArticleId, "Private", now.AddMinutes(1));
        fixture.Context.Notifications.AddRange(ownOne, ownTwo, other);
        await fixture.Context.SaveChangesAsync();

        var listed = await fixture.Service.ListAsync(1, 25, default);
        Assert.Equal(new[] { ownTwo.NotificationId, ownOne.NotificationId },
            listed.Items.Select(value => value.NotificationId));
        Assert.Equal(2, await fixture.Service.GetUnreadCountAsync(default));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            fixture.Service.MarkReadAsync(other.NotificationId, default));
        var read = await fixture.Service.MarkReadAsync(ownOne.NotificationId, default);
        Assert.True(read.IsRead);
        Assert.NotNull(read.ReadAt);
        var all = await fixture.Service.MarkAllReadAsync(default);
        Assert.Equal(1, all.MarkedReadCount);
        Assert.Equal(0, all.UnreadCount);
        Assert.False((await fixture.Context.Notifications.SingleAsync(value =>
            value.NotificationId == other.NotificationId)).IsRead);
    }

    [Fact]
    public async Task Unauthenticated_users_cannot_read_or_mutate_notifications()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Current.IsAuthenticated = false;
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => fixture.Service.ListAsync(1, 25, default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => fixture.Service.GetUnreadCountAsync(default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            fixture.Service.MarkReadAsync(Guid.NewGuid(), default));
    }

    [Fact]
    public async Task Workflow_comment_and_lock_events_create_user_specific_notifications_without_self_notices()
    {
        await using var fixture = await Fixture.CreateAsync();
        var roleId = Guid.NewGuid();
        fixture.Context.Roles.Add(new Role { RoleId = roleId, RoleName = "Reviewer" });
        fixture.Context.RolePermissions.Add(new RolePermission
            { RoleIdFk = roleId, PermissionCode = PermissionCodes.ArticlesReview });
        fixture.Context.UserRoles.Add(new UserRole
            { UserId = fixture.OtherUserId, RoleId = roleId, AssignedAt = DateTime.UtcNow });
        await fixture.Context.SaveChangesAsync();

        await fixture.Service.NotifyWorkflowAsync(fixture.ArticleId,
            NotificationTypes.ArticleSubmittedForReview, fixture.UserId, null, default);
        await fixture.Service.NotifyWorkflowAsync(fixture.ArticleId,
            NotificationTypes.ArticleApproved, fixture.OtherUserId, "Looks good.", default);
        await fixture.Service.NotifyCommentAsync(fixture.ArticleId, Guid.NewGuid(), fixture.OtherUserId, false,
            default);
        await fixture.Service.NotifyLockChangedAsync(fixture.ArticleId,
            NotificationTypes.ArticleLockAcquired, fixture.OtherUserId, null, default);

        var rows = await fixture.Context.Notifications.AsNoTracking().OrderBy(value => value.CreatedAt).ToArrayAsync();
        Assert.Equal(4, rows.Length);
        Assert.Single(rows, value => value.UserIdFk == fixture.OtherUserId);
        Assert.Equal(3, rows.Count(value => value.UserIdFk == fixture.UserId));
        Assert.Contains(rows, value => value.Type == NotificationTypes.ArticleSubmittedForReview &&
            value.UserIdFk == fixture.OtherUserId);
        Assert.Contains(rows, value => value.Type == NotificationTypes.ArticleApproved &&
            value.Body!.Contains("Looks good."));
        Assert.DoesNotContain(rows, value => value.UserIdFk == fixture.UserId &&
            value.Type == NotificationTypes.ArticleSubmittedForReview);
    }

    [Fact]
    public async Task Article_preference_is_user_scoped_and_suppresses_existing_notification_delivery()
    {
        await using var fixture = await Fixture.CreateAsync();
        var roleId = Guid.NewGuid();
        fixture.Context.Roles.Add(new Role { RoleId = roleId, RoleName = "Reviewer" });
        fixture.Context.RolePermissions.Add(new RolePermission
            { RoleIdFk = roleId, PermissionCode = PermissionCodes.ArticlesReview });
        fixture.Context.UserRoles.Add(new UserRole
            { UserId = fixture.OtherUserId, RoleId = roleId, AssignedAt = DateTime.UtcNow });
        await fixture.Context.SaveChangesAsync();

        fixture.Current.UserId = fixture.OtherUserId;
        Assert.False(await fixture.Service.GetArticlePreferenceAsync(fixture.ArticleId, default));
        Assert.False(await fixture.Service.SetArticlePreferenceAsync(fixture.ArticleId, false, default));
        Assert.False(await fixture.Service.GetArticlePreferenceAsync(fixture.ArticleId, default));

        fixture.Current.UserId = fixture.UserId;
        await fixture.Service.NotifyWorkflowAsync(fixture.ArticleId,
            NotificationTypes.ArticleSubmittedForReview, fixture.UserId, null, default);

        Assert.Empty(await fixture.Context.Notifications.AsNoTracking().ToArrayAsync());
    }

    [Fact]
    public async Task Workflow_delivery_includes_enabled_subscribers_and_one_time_active_recipients()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Current.UserId = fixture.OtherUserId;
        Assert.True(await fixture.Service.SetArticlePreferenceAsync(fixture.ArticleId, true, default));

        fixture.Current.UserId = fixture.UserId;
        await fixture.Service.NotifyWorkflowAsync(fixture.ArticleId,
            NotificationTypes.ArticleApproved, fixture.UserId, null, default);
        Assert.Single(await fixture.Context.Notifications.AsNoTracking().ToArrayAsync(), value =>
            value.UserIdFk == fixture.OtherUserId && value.Type == NotificationTypes.ArticleApproved);

        fixture.Context.Notifications.RemoveRange(fixture.Context.Notifications);
        await fixture.Context.SaveChangesAsync();
        fixture.Current.UserId = fixture.OtherUserId;
        Assert.False(await fixture.Service.SetArticlePreferenceAsync(fixture.ArticleId, false, default));

        fixture.Current.UserId = fixture.UserId;
        await fixture.Service.NotifyWorkflowAsync(fixture.ArticleId,
            NotificationTypes.ArticleArchived, fixture.UserId, null, [fixture.OtherUserId], default);
        Assert.Single(await fixture.Context.Notifications.AsNoTracking().ToArrayAsync(), value =>
            value.UserIdFk == fixture.OtherUserId && value.Type == NotificationTypes.ArticleArchived);
        fixture.Current.UserId = fixture.OtherUserId;
        Assert.False(await fixture.Service.GetArticlePreferenceAsync(fixture.ArticleId, default));
    }

    private static Notification Notification(Guid userId, Guid articleId, string title, DateTime createdAt) => new()
    {
        NotificationId = Guid.NewGuid(), UserIdFk = userId, ArticleIdFk = articleId,
        Type = NotificationTypes.ArticleCommented, Title = title, Body = $"{title} message",
        IsRead = false, CreatedAt = createdAt
    };

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public KbDbContext Context { get; }
        public NotificationService Service { get; }
        public MutableCurrentUser Current { get; }
        public Guid UserId { get; }
        public Guid OtherUserId { get; }
        public Guid ArticleId { get; }

        private Fixture(SqliteConnection connection, KbDbContext context, NotificationService service,
            MutableCurrentUser current, Guid userId, Guid otherUserId, Guid articleId) =>
            (this.connection, Context, Service, Current, UserId, OtherUserId, ArticleId) =
            (connection, context, service, current, userId, otherUserId, articleId);

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var userId = Guid.NewGuid();
            var otherUserId = Guid.NewGuid();
            var articleId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            context.Users.AddRange(User(userId, "Author", now), User(otherUserId, "Reviewer", now));
            context.Articles.Add(new Article
            {
                ArticleId = articleId, AuthorIdFk = userId, Title = "Notification article",
                Slug = $"notifications-{articleId:N}", Status = ArticleStatuses.Draft,
                CreatedAt = now, UpdatedAt = now
            });
            await context.SaveChangesAsync();
            var current = new MutableCurrentUser { UserId = userId };
            var service = new NotificationService(new NotificationRepository(context), current, TimeProvider.System);
            return new(connection, context, service, current, userId, otherUserId, articleId);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static User User(Guid id, string name, DateTime now) => new()
        {
            UserId = id, Email = $"{id}@example.test", FullName = name, IsActive = true, CreatedAt = now
        };
    }

    private sealed class MutableCurrentUser : ICurrentUser
    {
        public bool IsAuthenticated { get; set; } = true;
        public Guid UserId { get; set; }
        public string? Email => null;
    }
}
