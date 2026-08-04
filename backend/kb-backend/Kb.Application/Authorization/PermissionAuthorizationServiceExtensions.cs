using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace Kb.Application.Authorization;

public static class PermissionAuthorizationServiceExtensions
{
    // This is a global permission check. Pass a resource only when a future resource handler is added.
    public static Task<AuthorizationResult> AuthorizePermissionAsync(
        this IAuthorizationService authorizationService,
        ClaimsPrincipal user,
        string permissionCode,
        object? resource = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(permissionCode);
        return authorizationService.AuthorizeAsync(user, resource, PermissionPolicy.For(permissionCode));
    }
}
