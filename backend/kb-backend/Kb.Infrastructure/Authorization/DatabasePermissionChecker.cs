using Kb.Application.Abstractions;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Authorization;

public sealed class DatabasePermissionChecker(KbDbContext dbContext) : IPermissionChecker
{
    public Task<bool> HasPermissionAsync(Guid userId, string permissionCode, CancellationToken cancellationToken) =>
        (from user in dbContext.Users.AsNoTracking()
         join userRole in dbContext.UserRoles.AsNoTracking() on user.UserId equals userRole.UserId
         join role in dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.RoleId
         join rolePermission in dbContext.RolePermissions.AsNoTracking() on role.RoleId equals rolePermission.RoleIdFk
         where user.UserId == userId && user.IsActive && rolePermission.PermissionCode == permissionCode
         select rolePermission).AnyAsync(cancellationToken);
}
