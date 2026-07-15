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
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
           });
        });
        services.AddControllers();
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
        services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionAuthorizationPolicyProvider>();
        services.AddAuthorization();
        return services;
    }
}
