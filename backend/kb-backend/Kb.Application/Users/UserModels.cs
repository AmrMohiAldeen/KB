namespace Kb.Application.Users;

public sealed record UserRoleData(Guid RoleId, string RoleName);

public sealed record UserListItemData(
    Guid UserId,
    string Email,
    string FullName,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    IReadOnlyList<UserRoleData> Roles);

public sealed record UserListQuery(
    string? Search,
    string? Role,
    bool? IsActive,
    int Page,
    int PageSize,
    string SortBy,
    bool Descending);

public sealed record PagedUserData(
    IReadOnlyList<UserListItemData> Items,
    int Page,
    int PageSize,
    long TotalCount);
