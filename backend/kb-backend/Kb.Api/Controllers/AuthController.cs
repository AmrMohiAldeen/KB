using Kb.Application.Abstractions;
using Kb.Contracts.Auth;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/auth")]
public sealed class AuthController(ICurrentUser currentUser, IPermissionChecker permissions) : ControllerBase
{
    [HttpGet("me")]
    public IActionResult GetCurrentUser()
    {
        return Ok(new
        {
            IsAuthenticated = User.Identity?.IsAuthenticated ?? false,
            Name = User.Identity?.Name,
            AuthenticationType = User.Identity?.AuthenticationType,
            Claims = User.Claims.Select(claim => new
            {
                claim.Type,
                claim.Value
            })
        });
    }

    [HttpGet("me/permissions")]
    [ProducesResponseType<PermissionContextResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PermissionContextResponse>> GetPermissions(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var granted = new List<string> { "articles.view" };

        foreach (var permission in PermissionCodes.All.Order(StringComparer.Ordinal))
            if (await permissions.HasPermissionAsync(userId, permission, cancellationToken))
                granted.Add(permission);

        return Ok(new PermissionContextResponse(userId, granted));
    }
}
