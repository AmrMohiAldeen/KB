using Kb.Application.Abstractions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;

namespace Kb.Application.Authorization;

// Permission: can a user generally perform an action?
// Resource and workflow checks remain in the use case that owns the article or draft.
public sealed class PermissionAuthorizationHandler(ICurrentUser currentUser, IPermissionChecker permissionChecker)
    : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (!currentUser.IsAuthenticated)
            return;

        var cancellationToken = (context.Resource as HttpContext)?.RequestAborted ?? CancellationToken.None;
        if (await permissionChecker.HasPermissionAsync(currentUser.UserId, requirement.PermissionCode, cancellationToken))
            context.Succeed(requirement);
    }
}
