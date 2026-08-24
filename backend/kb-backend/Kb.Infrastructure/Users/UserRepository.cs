using Kb.Application.Users;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

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

    public async Task<UserListItemData> CreateAsync(NewUserData user, UserAuditData audit,
        CancellationToken cancellationToken)
    {
        if (await EmailExistsAsync(user.Email, null, cancellationToken))
            throw new ConflictException("A user with this email already exists.");

        var role = await dbContext.Roles.AsNoTracking().SingleOrDefaultAsync(item => item.RoleId == user.RoleId,
            cancellationToken) ?? throw new NotFoundException("The selected role was not found.");
        var entity = new User
        {
            UserId = Guid.NewGuid(),
            FullName = user.FullName,
            Email = user.Email,
            IsActive = true,
            CreatedAt = user.CreatedAt
        };
        dbContext.Users.Add(entity);
        dbContext.UserRoles.Add(new UserRole
        {
            UserId = entity.UserId,
            RoleId = role.RoleId,
            AssignedByFk = audit.ActorId,
            AssignedAt = audit.CreatedAt
        });
        AddAudit(entity.UserId, audit, UserAuditActions.Created, new
        {
            fullName = entity.FullName,
            email = entity.Email
        });
        AddAudit(entity.UserId, audit, UserAuditActions.RoleAssigned, new
        {
            roleId = role.RoleId,
            roleName = role.RoleName
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsEmailUniquenessViolation(exception))
        {
            throw new ConflictException("A user with this email already exists.");
        }
        return ToData(entity, [new(role.RoleId, role.RoleName)]);
    }

    public async Task<UserListItemData> ChangeRoleAsync(Guid userId, Guid roleId, UserAuditData audit,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.Include(item => item.UserRoleUsers)
            .ThenInclude(link => link.Role)
            .SingleOrDefaultAsync(item => item.UserId == userId, cancellationToken)
            ?? throw new NotFoundException("The user was not found.");
        var role = await dbContext.Roles.AsNoTracking().SingleOrDefaultAsync(item => item.RoleId == roleId,
            cancellationToken) ?? throw new NotFoundException("The selected role was not found.");
        var previousRoles = user.UserRoleUsers
            .Select(link => new UserRoleData(link.RoleId, link.Role.RoleName)).ToArray();
        if (previousRoles.Length == 1 && previousRoles[0].RoleId == roleId)
            return ToData(user, previousRoles);

        dbContext.UserRoles.RemoveRange(user.UserRoleUsers);
        dbContext.UserRoles.Add(new UserRole
        {
            UserId = user.UserId,
            RoleId = role.RoleId,
            AssignedByFk = audit.ActorId,
            AssignedAt = audit.CreatedAt
        });
        AddAudit(user.UserId, audit, UserAuditActions.RoleChanged, new
        {
            previousRoles = previousRoles.Select(item => new { roleId = item.RoleId, roleName = item.RoleName }),
            roleId = role.RoleId,
            roleName = role.RoleName
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return ToData(user, [new(role.RoleId, role.RoleName)]);
    }

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

    private Task<bool> EmailExistsAsync(string email, Guid? excludingUserId, CancellationToken cancellationToken)
    {
        var normalized = email.ToUpperInvariant();
        return dbContext.Users.AsNoTracking().AnyAsync(item => item.Email.ToUpper() == normalized &&
            (!excludingUserId.HasValue || item.UserId != excludingUserId.Value), cancellationToken);
    }

    private void AddAudit(Guid userId, UserAuditData audit, string action, object metadata) =>
        dbContext.ArticleAuditLogs.Add(new ArticleAuditLog
        {
            AuditLogId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
            ActorIdFk = audit.ActorId,
            ActionType = action,
            EntityType = AuditEntityTypes.User,
            EntityId = userId,
            MetaDataJson = JsonSerializer.Serialize(metadata),
            CreatedAt = audit.CreatedAt
        });

    private static UserListItemData ToData(User user, IReadOnlyList<UserRoleData> roles) => new(
        user.UserId, user.Email, user.FullName, user.IsActive, user.CreatedAt, user.LastLoginAt, roles);

    private static bool IsEmailUniquenessViolation(DbUpdateException exception) =>
        HasUniqueViolation(exception, "UX_USERS_Email", "USERS.Email");

    private static bool HasUniqueViolation(DbUpdateException exception, string indexName, string sqliteColumn)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current.Message.Contains(indexName, StringComparison.OrdinalIgnoreCase) ||
                current.Message.Contains($"UNIQUE constraint failed: {sqliteColumn}", StringComparison.OrdinalIgnoreCase))
                return true;
        return false;
    }
}
