using Kb.Application.Abstractions;
using Microsoft.AspNetCore.Authorization;

namespace Kb.Api.Authorization;

public static class AdminPolicy { public const string Name = "AdminOnly"; }
public sealed class AdminRequirement : IAuthorizationRequirement;

public sealed class AdminAuthorizationHandler(ICurrentUser currentUser, IAdminChecker checker)
    : AuthorizationHandler<AdminRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context,
        AdminRequirement requirement)
    {
        if (currentUser.IsAuthenticated && await checker.IsAdminAsync(currentUser.UserId, CancellationToken.None))
            context.Succeed(requirement);
    }
}
