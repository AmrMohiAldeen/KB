using Kb.Application.Categories;
using Kb.Application.Articles;
using Kb.Application.Drafts;
using Microsoft.Extensions.DependencyInjection;

namespace Kb.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<CategoryService>();
        services.AddScoped<ArticleService>();
        services.AddScoped<ArticleDraftService>();
        return services;
    }
}
