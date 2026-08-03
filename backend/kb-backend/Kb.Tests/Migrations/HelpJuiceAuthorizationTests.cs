using System.Reflection;
using System.Security.Claims;
using Kb.Api.Authorization;
using Kb.Api.Controllers;
using Kb.Application.Abstractions;
using Microsoft.AspNetCore.Authorization;

namespace Kb.Tests.Migrations;

public sealed class HelpJuiceAuthorizationTests
{
    [Fact]
    public async Task Admin_policy_succeeds_only_for_authenticated_database_admin()
    {
        var userId=Guid.NewGuid();var requirement=new AdminRequirement();
        var allowed=new AuthorizationHandlerContext([requirement],new ClaimsPrincipal(new ClaimsIdentity("test")),null);
        await new AdminAuthorizationHandler(new User(true,userId),new Checker(true)).HandleAsync(allowed);Assert.True(allowed.HasSucceeded);
        var denied=new AuthorizationHandlerContext([requirement],new ClaimsPrincipal(new ClaimsIdentity("test")),null);
        await new AdminAuthorizationHandler(new User(true,userId),new Checker(false)).HandleAsync(denied);Assert.False(denied.HasSucceeded);
    }

    [Fact]
    public void Every_helpjuice_endpoint_is_protected_by_admin_policy()
    {
        Assert.Equal(AdminPolicy.Name,typeof(HelpJuiceMigrationsController).GetCustomAttribute<AuthorizeAttribute>()?.Policy);
    }

    private sealed class User(bool authenticated,Guid id):ICurrentUser{public bool IsAuthenticated=>authenticated;public Guid UserId=>id;public string? Email=>null;}
    private sealed class Checker(bool result):IAdminChecker{public Task<bool> IsAdminAsync(Guid userId,CancellationToken cancellationToken)=>Task.FromResult(result);}
}
