using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Users;

public sealed record UserListItemResponse(
    Guid UserId,
    string Email,
    string FullName,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    IReadOnlyList<RoleSummaryResponse> Roles);

public sealed record UserDetailsResponse(
    Guid UserId,
    string Email,
    string FullName,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    IReadOnlyList<RoleSummaryResponse> Roles);

public sealed class UpdateUserStatusRequest
{
    public bool IsActive { get; init; }
}

public sealed class CreateUserRequest
{
    [Required, NonWhiteSpace, StringLength(200)]
    public required string FullName { get; init; }

    [Required, NonWhiteSpace, StringLength(320), EmailAddress]
    public required string Email { get; init; }

    [NonEmptyGuid]
    public Guid RoleId { get; init; }
}

public sealed class UpdateUserRoleRequest
{
    [NonEmptyGuid]
    public Guid RoleId { get; init; }
}
