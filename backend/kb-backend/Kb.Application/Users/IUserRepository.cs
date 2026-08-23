namespace Kb.Application.Users;

public interface IUserRepository
{
    Task<PagedUserData> GetPagedAsync(UserListQuery query, CancellationToken cancellationToken);
    Task<IReadOnlyList<UserRoleData>> GetRolesAsync(CancellationToken cancellationToken);
}
