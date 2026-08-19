using Kb.Api.Authentication;
using Kb.Application.Viewer;
using Kb.Contracts.Viewer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace Kb.Api.Controllers;

[ApiController]
[Route("api/viewer/auth")]
public sealed class ViewerAuthController(ViewerTokenService tokens, ViewerTokenOptions tokenOptions, ViewerService viewers,
    ILogger<ViewerAuthController> logger) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("exchange")]
    public async Task<ActionResult<ViewerSessionResponse>> Exchange(ViewerHandoffExchangeRequest request,
        CancellationToken cancellationToken)
    {
        var session = await ExchangeCoreAsync(request.Token, cancellationToken);
        return Ok(Map(session));
    }

    [AllowAnonymous]
    [IgnoreAntiforgeryToken]
    [HttpPost("exchange/redirect")]
    [Consumes("application/x-www-form-urlencoded")]
    public async Task<IActionResult> ExchangeAndRedirect([FromForm] string token, [FromForm] string solutionSlug,
        CancellationToken cancellationToken)
    {
        var session = await ExchangeCoreAsync(token, cancellationToken);
        var solution = session.Solutions.SingleOrDefault(item =>
            string.Equals(item.Slug, solutionSlug, StringComparison.OrdinalIgnoreCase))
            ?? throw new Kb.Application.Exceptions.ForbiddenException(
                "The handoff is not entitled to the requested redirect solution.");
        if (!Uri.TryCreate(tokenOptions.FrontendBaseUrl.TrimEnd('/') + "/", UriKind.Absolute, out var frontend))
            throw new InvalidOperationException("ViewerAuthentication:FrontendBaseUrl is not configured.");
        return Redirect(new Uri(frontend, Uri.EscapeDataString(solution.Slug)).ToString());
    }

    private async Task<ViewerSessionData> ExchangeCoreAsync(string token, CancellationToken cancellationToken)
    {
        ViewerHandoffIdentity handoff;
        try
        {
            handoff = tokens.ValidateHandoff(token, HttpContext.Connection.RemoteIpAddress?.ToString(),
                Request.Headers.UserAgent.ToString());
        }
        catch (SecurityTokenException exception)
        {
            logger.LogWarning(exception, "Viewer handoff token validation failed from {RemoteIp}.",
                HttpContext.Connection.RemoteIpAddress);
            throw new UnauthorizedAccessException("The Viewer handoff token is invalid or expired.");
        }
        var session = await viewers.ExchangeAsync(handoff, cancellationToken);
        Response.Cookies.Append(ViewerAuthenticationOptions.CookieName, tokens.IssueSession(session),
            new CookieOptions
            {
                HttpOnly = true, Secure = true, SameSite = SameSiteMode.Lax, Path = "/",
                Expires = new DateTimeOffset(session.ExpiresAt)
            });
        return session;
    }

    [Authorize(AuthenticationSchemes = ViewerAuthenticationDefaults.Scheme)]
    [HttpGet("session")]
    public async Task<ActionResult<ViewerSessionResponse>> Session(CancellationToken cancellationToken)
    {
        var sessionId = Guid.Parse(User.FindFirst(ViewerAuthenticationDefaults.SessionIdClaim)!.Value);
        var result = await viewers.ValidateSessionAsync(sessionId, cancellationToken);
        if (!result.IsValid || result.Session is null) throw new UnauthorizedAccessException();
        return Ok(Map(result.Session));
    }

    [Authorize(AuthenticationSchemes = ViewerAuthenticationDefaults.Scheme)]
    [HttpPost("signout")]
    public async Task<IActionResult> SignOutViewer(CancellationToken cancellationToken)
    {
        await viewers.RevokeCurrentSessionAsync(cancellationToken);
        Response.Cookies.Delete(ViewerAuthenticationOptions.CookieName,
            new CookieOptions { Secure = true, HttpOnly = true, SameSite = SameSiteMode.Lax, Path = "/" });
        return NoContent();
    }

    private static ViewerSessionResponse Map(ViewerSessionData session) => new(session.SessionId,
        session.CustomerId, session.ExternalUserId, session.ExternalUserEmail, session.ExpiresAt,
        session.Solutions.Select(item => new ViewerSolutionResponse(item.SolutionId, item.Slug)).ToArray());
}
