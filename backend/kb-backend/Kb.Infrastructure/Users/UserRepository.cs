using Kb.Application.Users;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Users;

public sealed class UserRepository(KbDbContext dbContext) : IUserRepository
{
    public async Task<PagedUserData> GetPagedAsync(UserListQuery query, CancellationToken cancellationToken)
    {
        var source = dbContext.Users.AsNoTracking().AsQueryable();

        if (query.Search is { } search)
            source = source.Where(user =>
                user.FullName.Contains(search) || user.Email.Contains(search) ||
                user.UserRoleUsers.Any(link => link.Role.RoleName.Contains(search)));
        if (query.Role is { } role)
            source = source.Where(user => user.UserRoleUsers.Any(link => link.Role.RoleName == role));
        if (query.IsActive is { } isActive)
            source = source.Where(user => user.IsActive == isActive);

        var totalCount = await source.LongCountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(query.Page - 1) * query.PageSize, int.MaxValue);
        var items = await Order(source, query.SortBy, query.Descending)
            .Skip(skip)
            .Take(query.PageSize)
            .Select(user => new UserListItemData(
                user.UserId, user.Email, user.FullName, user.IsActive,
                user.CreatedAt, user.LastLoginAt,
                user.UserRoleUsers.OrderBy(link => link.Role.RoleName)
                    .Select(link => new UserRoleData(link.RoleId, link.Role.RoleName)).ToArray()))
            .ToListAsync(cancellationToken);

        return new(items, query.Page, query.PageSize, totalCount);
    }

    public async Task<IReadOnlyList<UserRoleData>> GetRolesAsync(CancellationToken cancellationToken) =>
        await dbContext.Roles.AsNoTracking().OrderBy(role => role.RoleName)
            .Select(role => new UserRoleData(role.RoleId, role.RoleName))
            .ToListAsync(cancellationToken);

    private static IOrderedQueryable<User> Order(IQueryable<User> source, string sortBy, bool descending) =>
        (sortBy.ToLowerInvariant(), descending) switch
        {
            ("email", false) => source.OrderBy(user => user.Email).ThenBy(user => user.UserId),
            ("email", true) => source.OrderByDescending(user => user.Email).ThenByDescending(user => user.UserId),
            ("role", false) => source.OrderBy(user => user.UserRoleUsers.OrderBy(link => link.Role.RoleName)
                .Select(link => link.Role.RoleName).FirstOrDefault()).ThenBy(user => user.FullName).ThenBy(user => user.UserId),
            ("role", true) => source.OrderByDescending(user => user.UserRoleUsers.OrderBy(link => link.Role.RoleName)
                .Select(link => link.Role.RoleName).FirstOrDefault()).ThenByDescending(user => user.FullName).ThenByDescending(user => user.UserId),
            ("status", false) => source.OrderBy(user => user.IsActive).ThenBy(user => user.FullName).ThenBy(user => user.UserId),
            ("status", true) => source.OrderByDescending(user => user.IsActive).ThenByDescending(user => user.FullName).ThenByDescending(user => user.UserId),
            ("createdat", false) => source.OrderBy(user => user.CreatedAt).ThenBy(user => user.UserId),
            ("createdat", true) => source.OrderByDescending(user => user.CreatedAt).ThenByDescending(user => user.UserId),
            ("lastloginat", false) => source.OrderBy(user => user.LastLoginAt).ThenBy(user => user.UserId),
            ("lastloginat", true) => source.OrderByDescending(user => user.LastLoginAt).ThenByDescending(user => user.UserId),
            (_, true) => source.OrderByDescending(user => user.FullName).ThenByDescending(user => user.UserId),
            _ => source.OrderBy(user => user.FullName).ThenBy(user => user.UserId)
        };
}
