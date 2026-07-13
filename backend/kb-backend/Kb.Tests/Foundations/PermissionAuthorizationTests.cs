using Kb.Application.Abstractions;
using Kb.Application.Authorization;
using Kb.Domain.Constants;
using Kb.Infrastructure.Authorization;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Foundations;

public sealed class PermissionAuthorizationTests
{
    [Fact]
    public async Task Active_user_with_permission_succeeds_and_user_without_permission_fails()
    {
        await using var fixture = await PermissionFixture.CreateAsync();
        var permitted = await fixture.AddUserAsync(active: true, PermissionCodes.ArticlesCreate);
        var denied = await fixture.AddUserAsync(active: true, PermissionCodes.ArticlesDelete);

        Assert.True(await fixture.Checker.HasPermissionAsync(permitted, PermissionCodes.ArticlesCreate, CancellationToken.None));
        Assert.False(await fixture.Checker.HasPermissionAsync(denied, PermissionCodes.ArticlesCreate, CancellationToken.None));
    }

    [Fact]
    public async Task Inactive_user_does_not_receive_permissions()
    {
        await using var fixture = await PermissionFixture.CreateAsync();
        var userId = await fixture.AddUserAsync(active: false, PermissionCodes.ArticlesCreate);

        Assert.False(await fixture.Checker.HasPermissionAsync(userId, PermissionCodes.ArticlesCreate, CancellationToken.None));
    }

    [Fact]
    public async Task Multiple_roles_combine_permissions_and_equivalent_permissions_remain_idempotent()
    {
        await using var fixture = await PermissionFixture.CreateAsync();
        var userId = await fixture.AddUserAsync(active: true, PermissionCodes.ArticlesCreate, PermissionCodes.ArticlesReview, PermissionCodes.ArticlesCreate);

        Assert.True(await fixture.Checker.HasPermissionAsync(userId, PermissionCodes.ArticlesCreate, CancellationToken.None));
        Assert.True(await fixture.Checker.HasPermissionAsync(userId, PermissionCodes.ArticlesReview, CancellationToken.None));
    }

    [Fact]
    public async Task Handler_succeeds_only_when_current_user_has_the_permission()
    {
        var userId = Guid.NewGuid();
        var checker = new StubPermissionChecker(true);
        var handler = new PermissionAuthorizationHandler(new TestCurrentUser(true, userId), checker);
        var requirement = new PermissionRequirement(PermissionCodes.ArticlesCreate);
        var context = new AuthorizationHandlerContext([requirement], new System.Security.Claims.ClaimsPrincipal(), null);

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
        Assert.Equal(PermissionCodes.ArticlesCreate, checker.RequestedPermission);
    }

    private sealed class PermissionFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;
        public KbDbContext Context { get; }
        public DatabasePermissionChecker Checker { get; }

        private PermissionFixture(SqliteConnection connection, KbDbContext context)
        {
            _connection = connection;
            Context = context;
            Checker = new DatabasePermissionChecker(context);
        }

        public static async Task<PermissionFixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>().UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            return new PermissionFixture(connection, context);
        }

        public async Task<Guid> AddUserAsync(bool active, params string[] permissions)
        {
            var userId = Guid.NewGuid();
            var now = DateTime.UtcNow;
            await Context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO USERS (UserID, Email, FullName, IsActive, CreatedAt)
                VALUES ({userId}, {$"{userId}@example.test"}, {"Test User"}, {active}, {now})
                """);
            foreach (var permission in permissions)
            {
                var roleId = Guid.NewGuid();
                await Context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO ROLES (RoleID, RoleName) VALUES ({roleId}, {roleId.ToString()})");
                await Context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO USER_ROLES (UserID, RoleID, AssignedAt) VALUES ({userId}, {roleId}, {now})");
                await Context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO ROLE_PERMISSIONS (RoleID_FK, PermissionCode) VALUES ({roleId}, {permission})");
            }
            return userId;
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }

    private sealed class StubPermissionChecker(bool hasPermission) : IPermissionChecker
    {
        public string? RequestedPermission { get; private set; }
        public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken)
        {
            RequestedPermission = permissionCode;
            return Task.FromResult(hasPermission);
        }
    }

    private sealed class TestCurrentUser(bool isAuthenticated, Guid userId) : ICurrentUser
    {
        public bool IsAuthenticated => isAuthenticated;
        public Guid UserId => userId;
        public string? Email => null;
    }
}
