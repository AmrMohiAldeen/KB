using Kb.Application.Abstractions;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Authorization;

public sealed class DatabaseAdminChecker(KbDbContext db) : IAdminChecker
{
    public Task<bool> IsAdminAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking().AnyAsync(user => user.UserId == userId && user.IsActive &&
            user.UserRoleUsers.Any(link => link.Role.RoleName == "Admin"), cancellationToken);
}
