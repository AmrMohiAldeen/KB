using Kb.Application.Abstractions;
using Kb.Infrastructure.Authorization;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kb.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<KbDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("kbDatabase")));
        services.AddScoped<IPermissionChecker, DatabasePermissionChecker>();
        services.AddSingleton<ISlugGenerator, SlugGenerator>();
        services.AddSingleton<TimeProvider>(TimeProvider.System);
        return services;
    }
}
