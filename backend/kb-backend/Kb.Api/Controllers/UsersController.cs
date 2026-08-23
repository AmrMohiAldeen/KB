using Kb.Application.Authorization;
using Kb.Application.Users;
using Kb.Contracts.Common;
using Kb.Contracts.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/users")]
public sealed class UsersController(UserService users) : ControllerBase
{
    private const string ManagePolicy = PermissionPolicy.Prefix + PermissionCodes.UsersManage;

    [HttpGet]
    [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<PagedResponse<UserListItemResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResponse<UserListItemResponse>>> GetList(
        [FromQuery] string? search,
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = UserService.DefaultPageSize,
        [FromQuery] string? sortBy = "fullName",
        [FromQuery] string? sortDirection = "asc",
        CancellationToken cancellationToken = default)
    {
        var result = await users.GetPagedAsync(
            search, role, status, page, pageSize, sortBy, sortDirection, cancellationToken);
        return Ok(new PagedResponse<UserListItemResponse>(
            result.Items.Select(ToResponse).ToArray(), result.Page, result.PageSize, result.TotalCount));
    }

    [HttpGet("roles")]
    [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<IReadOnlyList<RoleSummaryResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<RoleSummaryResponse>>> GetRoles(CancellationToken cancellationToken)
    {
        var roles = await users.GetRolesAsync(cancellationToken);
        return Ok(roles.Select(role => new RoleSummaryResponse(role.RoleId, role.RoleName)).ToArray());
    }

    private static UserListItemResponse ToResponse(UserListItemData user) => new(
        user.UserId, user.Email, user.FullName, user.IsActive, user.CreatedAt, user.LastLoginAt,
        user.Roles.Select(role => new RoleSummaryResponse(role.RoleId, role.RoleName)).ToArray());
}
