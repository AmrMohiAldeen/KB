using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Kb.Application.Viewer;
using Microsoft.IdentityModel.Tokens;

namespace Kb.Api.Authentication;

public static class ViewerAuthenticationDefaults
{
    public const string Scheme = "Viewer";
    public const string Role = "viewer";
    public const string SessionIdClaim = "session_id";
    public const string CustomerIdClaim = "customer_id";
    public const string SolutionIdClaim = "solution_id";
    public const string SolutionSlugClaim = "solution";
}

public static class ViewerPreviewAuthorizationDefaults
{
    public const string Policy = "InternalViewerPreview";
}

public sealed class ViewerTokenOptions
{
    public string Issuer { get; set; } = "knowledgebase";
    public string Audience { get; set; } = "knowledgebase-viewer";
    public string SessionSigningKey { get; set; } = string.Empty;
    public string HandoffIssuer { get; set; } = "swiftassess";
    public string HandoffAudience { get; set; } = "knowledgebase-handoff";
    public string HandoffSigningKey { get; set; } = string.Empty;
    public string FrontendBaseUrl { get; set; } = string.Empty;
}

internal static class ViewerTokenKeys
{
    private static readonly byte[] EphemeralSession = RandomNumberGenerator.GetBytes(32);
    private static readonly byte[] EphemeralHandoff = RandomNumberGenerator.GetBytes(32);
    public static byte[] Session(string? secret) => Key(secret, EphemeralSession);
    public static byte[] Handoff(string? secret) => Key(secret, EphemeralHandoff);
    private static byte[] Key(string? secret, byte[] fallback) => string.IsNullOrWhiteSpace(secret)
        ? fallback : SHA256.HashData(Encoding.UTF8.GetBytes(secret));
}

public sealed class ViewerTokenService(ViewerTokenOptions options)
{
    public ViewerHandoffIdentity ValidateHandoff(string token, string? ipAddress, string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new SecurityTokenException("The handoff token is required.");
        if (string.IsNullOrWhiteSpace(options.HandoffSigningKey))
            throw new InvalidOperationException("ViewerAuthentication:HandoffSigningKey is not configured.");
        var principal = new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(ViewerTokenKeys.Handoff(options.HandoffSigningKey)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256], ValidateIssuer = true,
            ValidIssuer = options.HandoffIssuer, ValidateAudience = true, ValidAudience = options.HandoffAudience,
            ValidateLifetime = true, RequireExpirationTime = true, RequireSignedTokens = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        }, out var validatedToken);
        if (validatedToken is not JwtSecurityToken jwt)
            throw new SecurityTokenException("The handoff token format is invalid.");
        var handoffId = principal.FindFirstValue(JwtRegisteredClaimNames.Jti);
        var subject = principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
                      principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var email = principal.FindFirstValue(ClaimTypes.Email) ?? principal.FindFirstValue(JwtRegisteredClaimNames.Email);
        var customer = principal.FindFirstValue(ViewerAuthenticationDefaults.CustomerIdClaim);
        var issuedAtClaim = jwt.Claims.FirstOrDefault(claim => claim.Type == JwtRegisteredClaimNames.Iat)?.Value;
        if (!long.TryParse(issuedAtClaim, out var issuedAtSeconds))
            throw new SecurityTokenException("The handoff token has no valid issued-at claim.");
        var solutions = principal.FindAll(ViewerAuthenticationDefaults.SolutionSlugClaim).Select(claim => claim.Value)
            .Concat(principal.FindAll("solutions").SelectMany(claim => claim.Value.Split(',',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))).Distinct().ToArray();
        return new(handoffId ?? string.Empty, subject ?? string.Empty, email ?? string.Empty, customer ?? string.Empty,
            solutions, DateTimeOffset.FromUnixTimeSeconds(issuedAtSeconds).UtcDateTime,
            jwt.ValidTo.ToUniversalTime(), ipAddress, userAgent);
    }

    public string IssueSession(ViewerSessionData session)
    {
        if (string.IsNullOrWhiteSpace(options.SessionSigningKey))
            throw new InvalidOperationException("ViewerAuthentication:SessionSigningKey is not configured.");
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, session.ExternalUserId),
            new(JwtRegisteredClaimNames.Email, session.ExternalUserEmail),
            new(ViewerAuthenticationDefaults.SessionIdClaim, session.SessionId.ToString("D")),
            new(ViewerAuthenticationDefaults.CustomerIdClaim, session.CustomerId.ToString("D")),
            new(ClaimTypes.Role, ViewerAuthenticationDefaults.Role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };
        foreach (var solution in session.Solutions)
        {
            claims.Add(new(ViewerAuthenticationDefaults.SolutionIdClaim, solution.SolutionId.ToString("D")));
            claims.Add(new(ViewerAuthenticationDefaults.SolutionSlugClaim, solution.Slug));
        }
        var token = new JwtSecurityToken(options.Issuer, options.Audience, claims, DateTime.UtcNow,
            session.ExpiresAt, new SigningCredentials(
                new SymmetricSecurityKey(ViewerTokenKeys.Session(options.SessionSigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public sealed class HttpCurrentViewer(IHttpContextAccessor accessor) : ICurrentViewer
{
    private ClaimsPrincipal Principal => accessor.HttpContext?.User ?? new ClaimsPrincipal();
    public bool IsAuthenticated => Principal.Identity?.IsAuthenticated == true &&
                                   Principal.IsInRole(ViewerAuthenticationDefaults.Role);
    public Guid SessionId => RequiredGuid(ViewerAuthenticationDefaults.SessionIdClaim);
    public Guid CustomerId => RequiredGuid(ViewerAuthenticationDefaults.CustomerIdClaim);
    public string ExternalUserId => Required(ClaimTypes.NameIdentifier, JwtRegisteredClaimNames.Sub);
    public string ExternalUserEmail => Required(ClaimTypes.Email, JwtRegisteredClaimNames.Email);
    private Guid RequiredGuid(string claim) => Guid.TryParse(Principal.FindFirstValue(claim), out var value) && value != Guid.Empty
        ? value : throw new UnauthorizedAccessException("The Viewer identity is incomplete.");
    private string Required(params string[] claims) => claims.Select(Principal.FindFirstValue)
        .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ??
        throw new UnauthorizedAccessException("The Viewer identity is incomplete.");
}
