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
