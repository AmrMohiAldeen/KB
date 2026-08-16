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
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()
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
        services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.AddScoped<IAuthorizationHandler, AdminAuthorizationHandler>();
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionAuthorizationPolicyProvider>();
        services.AddAuthorization(options => options.AddPolicy(AdminPolicy.Name,
            policy => policy.RequireAuthenticatedUser().AddRequirements(new AdminRequirement())));
        return services;
    }
}
