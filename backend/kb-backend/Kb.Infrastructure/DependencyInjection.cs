using Kb.Application.Abstractions;
using Kb.Application.Articles;
using Kb.Application.Categories;
using Kb.Application.Drafts;
using Kb.Application.Abstractions.Storage;
using Kb.Infrastructure.Articles;
using Kb.Infrastructure.Authorization;
using Kb.Infrastructure.Categories;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Drafts;
using Kb.Infrastructure.Services;
using Kb.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Azure.Storage.Blobs;

namespace Kb.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString =
            configuration["Storage:ConnectionString"]
            ?? throw new InvalidOperationException(
                "Storage connection string is missing.");

        services.AddSingleton(new BlobServiceClient(connectionString));
        services.AddScoped<IObjectStorage, AzureBlobObjectStorage>();
        services.AddDbContext<KbDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("kbDatabase")));
        services.AddScoped<IPermissionChecker, DatabasePermissionChecker>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<IArticleRepository, ArticleRepository>();
        services.AddScoped<IArticleDraftRepository, ArticleDraftRepository>();
        services.Configure<DraftContentOptions>(options =>
        {
            options.ContainerName = configuration["Storage:Containers:ArticleContent"] ?? "article-content";
            options.MaxContentSizeBytes = configuration.GetValue<int?>("Drafts:MaxContentSizeBytes")
                ?? DraftContentOptions.DefaultMaxContentSizeBytes;
        });
        services.AddSingleton<ISlugGenerator, SlugGenerator>();
        services.AddSingleton(TimeProvider.System);
        return services;
    }
}
