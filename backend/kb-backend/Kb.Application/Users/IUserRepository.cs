namespace Kb.Application.Users;

public interface IUserRepository
{
    Task<PagedUserData> GetPagedAsync(UserListQuery query, CancellationToken cancellationToken);
    Task<IReadOnlyList<UserRoleData>> GetRolesAsync(CancellationToken cancellationToken);
    Task<UserListItemData> CreateAsync(NewUserData user, UserAuditData audit, CancellationToken cancellationToken);
    Task<UserListItemData> ChangeRoleAsync(Guid userId, Guid roleId, UserAuditData audit, CancellationToken cancellationToken);
}
