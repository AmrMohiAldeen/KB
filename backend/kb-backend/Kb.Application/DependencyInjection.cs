using Kb.Application.Categories;
using Microsoft.Extensions.DependencyInjection;

namespace Kb.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<CategoryService>();
        return services;
    }
}
