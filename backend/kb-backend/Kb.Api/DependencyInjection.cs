using Kb.Api.Authentication;
using Kb.Api.Authorization;
using Kb.Api.ErrorHandling;
using Kb.Application.Abstractions;
using Kb.Application.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Kb.Api.OpenApi;
using Kb.Application.Media;
using Microsoft.AspNetCore.Http.Features;
using Kb.Application.Migrations.HelpJuice;
using Kb.Application.Viewer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Kb.Api;

public static class ApiCors
{
    public const string FrontendPolicy = "Frontend";
}

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services, IConfiguration configuration)
    {
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        if(allowedOrigins.Length ==0)
            throw new InvalidOperationException("No allowed origins configured for CORS. Please configure at least one allowed origin in the appsettings.json file.");

        services.AddCors(options =>
        {
           options.AddPolicy(ApiCors.FrontendPolicy, policy =>
           {
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()
                .WithExposedHeaders("Content-Disposition", "X-HelpJuice-Diagnostic-Records",
                    "X-HelpJuice-Diagnostic-Errors", "X-HelpJuice-Diagnostic-Warnings",
                    "X-HelpJuice-Diagnostic-Status");
           });
        });
        services.AddControllers();
        services.Configure<FormOptions>(options =>
        {
            var mediaMaximum = configuration.GetValue<long?>("Media:MaxFileSizeBytes") ?? MediaOptions.DefaultMaxFileSizeBytes;
            var migrationMaximum = configuration.GetValue<long?>("Migrations:HelpJuice:MaxPackageSizeBytes") ?? HelpJuiceMigrationLimits.DefaultMaxPackageSizeBytes;
            var maximumFileSize = Math.Max(mediaMaximum, migrationMaximum);
            options.MultipartBodyLengthLimit = checked(maximumFileSize + 1024 * 1024);
        });
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer<BearerSecuritySchemeTransformer>();
        });
        services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
            context.ProblemDetails.Extensions["traceId"] = System.Diagnostics.Activity.Current?.Id ?? context.HttpContext.TraceIdentifier);
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddHttpContextAccessor();
        // TODO: Configure company authentication/SSO and protect business endpoints.
        services.AddAuthentication();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();
        services.AddScoped<ICurrentViewer, HttpCurrentViewer>();
        var viewerTokens = new ViewerTokenOptions();
        configuration.GetSection("ViewerAuthentication").Bind(viewerTokens);
        services.AddSingleton(viewerTokens);
        services.AddSingleton<ViewerTokenService>();
        services.AddAuthentication().AddJwtBearer(ViewerAuthenticationDefaults.Scheme, options =>
        {
            options.MapInboundClaims = true;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(ViewerTokenKeys.Session(viewerTokens.SessionSigningKey)),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256], ValidateIssuer = true,
                ValidIssuer = viewerTokens.Issuer, ValidateAudience = true, ValidAudience = viewerTokens.Audience,
                ValidateLifetime = true, RequireExpirationTime = true, RequireSignedTokens = true,
                ClockSkew = TimeSpan.FromSeconds(30), RoleClaimType = System.Security.Claims.ClaimTypes.Role
            };
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    if (context.Request.Cookies.TryGetValue(ViewerAuthenticationOptions.CookieName, out var value))
                        context.Token = value;
                    return Task.CompletedTask;
                },
                OnTokenValidated = async context =>
                {
                    var sessionClaim = context.Principal?.FindFirst(ViewerAuthenticationDefaults.SessionIdClaim)?.Value;
                    if (!Guid.TryParse(sessionClaim, out var sessionId))
                    {
                        context.Fail("The Viewer session identifier is missing.");
                        return;
                    }
                    var service = context.HttpContext.RequestServices.GetRequiredService<ViewerService>();
                    var validation = await service.ValidateSessionAsync(sessionId, context.HttpContext.RequestAborted);
                    if (!validation.IsValid || validation.Session is null)
                    {
                        context.Fail("The Viewer session is revoked, expired, or no longer entitled.");
                        return;
                    }
                    var tokenSolutions = context.Principal!.FindAll(ViewerAuthenticationDefaults.SolutionIdClaim)
                        .Select(claim => claim.Value).ToHashSet(StringComparer.OrdinalIgnoreCase);
                    if (validation.Session.Solutions.Any(solution => !tokenSolutions.Contains(solution.SolutionId.ToString("D"))) ||
                        tokenSolutions.Count != validation.Session.Solutions.Count)
                        context.Fail("The Viewer token solution claims no longer match the session.");
                }
            };
        });
        services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.AddScoped<IAuthorizationHandler, AdminAuthorizationHandler>();
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionAuthorizationPolicyProvider>();
        services.AddAuthorization(options =>
        {
            options.AddPolicy(AdminPolicy.Name,
                policy => policy.RequireAuthenticatedUser().AddRequirements(new AdminRequirement()));
            options.AddPolicy(ViewerPreviewAuthorizationDefaults.Policy,
                policy => policy.RequireAuthenticatedUser()
                    .RequireClaim(Kb.Domain.Constants.ClaimNames.InternalUserId));
        });
        return services;
    }
}
