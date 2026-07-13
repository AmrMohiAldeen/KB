using System.Security.Claims;
using Kb.Api.Authentication;
using Kb.Api.Controllers;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Time.Testing;

namespace Kb.Tests.Foundations;

public sealed class CurrentUserAndTimeTests
{
    [Fact]
    public void Current_user_reads_valid_internal_kb_user_claim()
    {
        var id = Guid.NewGuid();
        var currentUser = CurrentUser(new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimNames.InternalUserId, id.ToString()), new Claim(ClaimTypes.Email, "user@example.test")], "test")));

        Assert.True(currentUser.IsAuthenticated);
        Assert.Equal(id, currentUser.UserId);
        Assert.Equal("user@example.test", currentUser.Email);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-guid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public void Current_user_rejects_missing_invalid_or_empty_internal_claim(string? claimValue)
    {
        var claims = claimValue is null ? [] : new[] { new Claim(ClaimNames.InternalUserId, claimValue) };
        var currentUser = CurrentUser(new ClaimsPrincipal(new ClaimsIdentity(claims, "test")));

        Assert.True(currentUser.IsAuthenticated);
        Assert.Throws<UnauthorizedAccessException>(() => _ = currentUser.UserId);
    }

    [Fact]
    public void Unauthenticated_current_user_fails_safely()
    {
        var currentUser = CurrentUser(new ClaimsPrincipal(new ClaimsIdentity()));

        Assert.False(currentUser.IsAuthenticated);
        Assert.Throws<UnauthorizedAccessException>(() => _ = currentUser.UserId);
    }

    [Fact]
    public void Fake_time_provider_controls_backend_generated_diagnostic_timestamp()
    {
        var time = new FakeTimeProvider();
        var expected = new DateTimeOffset(2030, 1, 2, 3, 4, 5, TimeSpan.Zero);
        time.SetUtcNow(expected);
        var controller = new HealthController(time);

        var result = Assert.IsType<OkObjectResult>(controller.Get());
        var utc = (DateTimeOffset)result.Value!.GetType().GetProperty("utc")!.GetValue(result.Value)!;
        Assert.Equal(expected, utc);
    }

    private static HttpCurrentUser CurrentUser(ClaimsPrincipal principal)
    {
        var accessor = new HttpContextAccessor { HttpContext = new DefaultHttpContext { User = principal } };
        return new HttpCurrentUser(accessor);
    }
}
