using System.Reflection;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Kb.Application.Authorization;
using Kb.Application.Exceptions;
using Kb.Application.Users;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Kb.Infrastructure.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Kb.Tests.Users;

public sealed class UserSliceTests
{
    [Fact]
    public async Task Listing_requires_authentication_and_users_permission()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Current.IsAuthenticated = false;
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => fixture.Service.GetPagedAsync(
            null, null, null, 1, 20, "fullName", "asc", default));

        fixture.Current.IsAuthenticated = true;
        await Assert.ThrowsAsync<ForbiddenException>(() => fixture.Service.GetPagedAsync(
            null, null, null, 1, 20, "fullName", "asc", default));

        fixture.PermissionGranted = true;
        Assert.Equal(3, (await fixture.Service.GetPagedAsync(
            null, null, null, 1, 20, "fullName", "asc", default)).TotalCount);
    }

    [Fact]
    public async Task Query_uses_real_users_and_role_links_with_filters_sorting_and_pagination()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.PermissionGranted = true;

        var admins = await fixture.Service.GetPagedAsync(
            "example.test", "Admin", "active", 1, 1, "createdAt", "desc", default);

        var admin = Assert.Single(admins.Items);
        Assert.Equal("Zara Admin", admin.FullName);
        Assert.Equal("Admin", Assert.Single(admin.Roles).RoleName);
        Assert.Equal(1, admins.TotalCount);

        var roles = await fixture.Service.GetRolesAsync(default);
        Assert.Equal(new[] { "Admin", "Reviewer" }, roles.Select(role => role.RoleName));
    }

    [Fact]
    public void Endpoints_follow_the_users_manage_policy_and_expose_read_only_operations()
    {
        var controller = typeof(UsersController);
        var methods = controller.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);
        Assert.Equal(2, methods.Length);
        Assert.All(methods, method => Assert.Equal(
            PermissionPolicy.Prefix + PermissionCodes.UsersManage,
            method.GetCustomAttribute<AuthorizeAttribute>()!.Policy));
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        private readonly PermissionChecker permissions;

        private Fixture(SqliteConnection connection, KbDbContext context, UserService service,
            CurrentUser current, PermissionChecker permissions)
        {
            this.connection = connection;
            Context = context;
            Service = service;
            Current = current;
            this.permissions = permissions;
        }

        public KbDbContext Context { get; }
        public UserService Service { get; }
        public CurrentUser Current { get; }
        public bool PermissionGranted { set => permissions.Granted = value; }

        public static async Task<Fixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var context = new KbDbContext(new DbContextOptionsBuilder<KbDbContext>()
                .UseSqlite(connection).Options);
            await context.Database.EnsureCreatedAsync();
            var now = new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc);
            var zara = User("Zara Admin", "zara@example.test", "sso-zara", true, now.AddDays(2));
            var amy = User("Amy Reviewer", "amy@example.test", "sso-amy", true, now.AddDays(1));
            var inactive = User("Inactive User", "inactive@example.test", null, false, now);
            var adminRole = new Role { RoleId = Guid.NewGuid(), RoleName = "Admin" };
            var reviewerRole = new Role { RoleId = Guid.NewGuid(), RoleName = "Reviewer" };
            context.Users.AddRange(zara, amy, inactive);
            context.Roles.AddRange(adminRole, reviewerRole);
            context.UserRoles.AddRange(
                new UserRole { UserId = zara.UserId, RoleId = adminRole.RoleId, AssignedAt = now },
                new UserRole { UserId = amy.UserId, RoleId = reviewerRole.RoleId, AssignedAt = now });
            await context.SaveChangesAsync();
            context.ChangeTracker.Clear();
            var current = new CurrentUser { UserId = zara.UserId };
            var permissions = new PermissionChecker();
            return new(connection, context, new UserService(new UserRepository(context), current, permissions),
                current, permissions);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static User User(string name, string email, string? ssoId, bool active, DateTime createdAt) => new()
        {
            UserId = Guid.NewGuid(), FullName = name, Email = email, SsoId = ssoId,
            IsActive = active, CreatedAt = createdAt
        };
    }

    private sealed class CurrentUser : ICurrentUser
    {
        public bool IsAuthenticated { get; set; } = true;
        public Guid UserId { get; set; }
        public string? Email => null;
    }

    private sealed class PermissionChecker : IPermissionChecker
    {
        public bool Granted { get; set; }
        public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken) =>
            Task.FromResult(Granted && permissionCode == PermissionCodes.UsersManage);
    }
}
