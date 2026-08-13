using Kb.Application.Abstractions;
using Kb.Application.Articles;
using Kb.Application.Audit;
using Kb.Application.Categories;
using Kb.Application.Drafts;
using Kb.Application.Media;
using Kb.Application.Abstractions.Storage;
using Kb.Infrastructure.Articles;
using Kb.Infrastructure.Audit;
using Kb.Infrastructure.Authorization;
using Kb.Infrastructure.Categories;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Drafts;
using Kb.Infrastructure.Media;
using Kb.Application.Lifecycle;
using Kb.Infrastructure.Lifecycle;
using Kb.Application.Comments;
using Kb.Infrastructure.Comments;
using Kb.Application.Dashboard;
using Kb.Infrastructure.Dashboard;
using Kb.Infrastructure.Services;
using Kb.Infrastructure.Storage;
using Kb.Application.Migrations.HelpJuice;
using Kb.Infrastructure.Migrations.HelpJuice;
using Kb.Application.Notifications;
using Kb.Infrastructure.Notifications;
using Kb.Application.ExportJobs;
using Kb.Infrastructure.ExportJobs;
using Kb.Application.Search;
using Kb.Infrastructure.Search;
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

        var blobOptions = new BlobClientOptions
        {
            Retry =
            {
                MaxRetries = configuration.GetValue<int?>("Storage:Retry:MaxRetries") ?? 2,
                Delay = TimeSpan.FromMilliseconds(
                    configuration.GetValue<int?>("Storage:Retry:DelayMilliseconds") ?? 250),
                MaxDelay = TimeSpan.FromSeconds(
                    configuration.GetValue<int?>("Storage:Retry:MaxDelaySeconds") ?? 2),
                NetworkTimeout = TimeSpan.FromSeconds(
                    configuration.GetValue<int?>("Storage:Retry:NetworkTimeoutSeconds") ?? 5)
            }
        };
        services.AddSingleton(new BlobServiceClient(connectionString, blobOptions));
        services.AddScoped<IObjectStorage, AzureBlobObjectStorage>();
        services.AddDbContext<KbDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("kbDatabase")));
        services.AddScoped<IPermissionChecker, DatabasePermissionChecker>();
        services.AddScoped<IAdminChecker, DatabaseAdminChecker>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<IArticleRepository, ArticleRepository>();
        services.AddScoped<IArticleDraftRepository, ArticleDraftRepository>();
        services.AddScoped<IAuditLogRepository, AuditLogRepository>();
        services.AddScoped<IMediaRepository, MediaRepository>();
        services.AddScoped<IArticleLifecycleRepository, ArticleLifecycleRepository>();
        services.AddScoped<IArticleCommentRepository, ArticleCommentRepository>();
        services.AddScoped<IDashboardRepository, DashboardRepository>();
        services.AddScoped<IHelpJuiceImportWriter, HelpJuiceImportWriter>();
        services.AddHttpClient("HelpJuiceMigration", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(45);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("GamaLearn-KB-HelpJuice-Migration/1.0");
        });
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<IExportJobRepository, ExportJobRepository>();
        services.AddScoped<IExportMediaResolver, ExportMediaResolver>();
        services.AddSingleton<IExportJobSignal, ExportJobSignal>();
        services.AddSingleton<IPdfRenderer, ChromiumPdfRenderer>();
        services.AddHostedService<ExportJobWorker>();
        services.AddHttpClient<TypesenseInternalSearchClient>();
        services.AddScoped<IInternalSearchClient>(provider => provider.GetRequiredService<TypesenseInternalSearchClient>());
        services.AddScoped<ITypesenseInternalIndex>(provider => provider.GetRequiredService<TypesenseInternalSearchClient>());
        services.AddScoped<InternalSearchDocumentSource>();
        services.AddSingleton<InternalSearchSynchronization>();
        services.AddScoped<IInternalSearchMaintenance, InternalSearchMaintenance>();
        services.AddHostedService<InternalSearchJobWorker>();
        services.Configure<DraftContentOptions>(options =>
        {
            options.ContainerName = configuration["Storage:Containers:ArticleContent"] ?? "article-content";
            options.MaxContentSizeBytes = configuration.GetValue<int?>("Drafts:MaxContentSizeBytes")
                ?? DraftContentOptions.DefaultMaxContentSizeBytes;
        });
        services.Configure<MediaOptions>(options =>
        {
            options.ContainerName = configuration["Storage:Containers:Media"] ?? "media";
            options.MaxFileSizeBytes = configuration.GetValue<long?>("Media:MaxFileSizeBytes")
                ?? MediaOptions.DefaultMaxFileSizeBytes;
        });
        services.Configure<ExportOptions>(options =>
        {
            options.ContainerName = configuration["Storage:Containers:Exports"] ?? "exports";
            options.ArticleContentContainerName = configuration["Storage:Containers:ArticleContent"] ?? "article-content";
            options.MediaContainerName = configuration["Storage:Containers:Media"] ?? "media";
            options.ChromiumExecutablePath = configuration["Exports:ChromiumExecutablePath"];
            options.MaxEmbeddedMediaBytes = configuration.GetValue<int?>("Exports:MaxEmbeddedMediaBytes")
                ?? 20 * 1024 * 1024;
            options.PollInterval = TimeSpan.FromMilliseconds(
                configuration.GetValue<int?>("Exports:PollIntervalMilliseconds") ?? 2000);
            options.JobTimeout = TimeSpan.FromSeconds(
                configuration.GetValue<int?>("Exports:JobTimeoutSeconds") ?? 60);
        });
        services.Configure<HelpJuiceMigrationLimits>(options =>
        {
            options.MaxPackageSizeBytes = configuration.GetValue<long?>("Migrations:HelpJuice:MaxPackageSizeBytes") ?? HelpJuiceMigrationLimits.DefaultMaxPackageSizeBytes;
            options.MaxExtractedSizeBytes = configuration.GetValue<long?>("Migrations:HelpJuice:MaxExtractedSizeBytes") ?? HelpJuiceMigrationLimits.DefaultMaxExtractedSizeBytes;
            options.MaxEntrySizeBytes = configuration.GetValue<long?>("Migrations:HelpJuice:MaxEntrySizeBytes") ?? 256L * 1024 * 1024;
            options.MaxArticleContentSizeBytes = configuration.GetValue<long?>("Drafts:MaxContentSizeBytes") ?? DraftContentOptions.DefaultMaxContentSizeBytes;
            options.MaxEntries = configuration.GetValue<int?>("Migrations:HelpJuice:MaxEntries") ?? HelpJuiceMigrationLimits.DefaultMaxEntries;
            options.MaxCsvRows = configuration.GetValue<int?>("Migrations:HelpJuice:MaxCsvRows") ?? HelpJuiceMigrationLimits.DefaultMaxCsvRows;
            options.BatchSize = configuration.GetValue<int?>("Migrations:HelpJuice:BatchSize") ?? HelpJuiceMigrationLimits.DefaultBatchSize;
            options.MaxCompressionRatio = configuration.GetValue<int?>("Migrations:HelpJuice:MaxCompressionRatio") ?? HelpJuiceMigrationLimits.DefaultMaxCompressionRatio;
        });
        services.Configure<InternalSearchOptions>(options =>
        {
            options.Endpoint = configuration["Typesense:Endpoint"] ?? string.Empty;
            options.AdminApiKey = configuration["Typesense:AdminApiKey"] ?? string.Empty;
            options.CollectionAlias = configuration["Typesense:InternalCollectionAlias"] ?? "internal_kb_documents";
            options.ArticleContentContainerName = configuration["Storage:Containers:ArticleContent"] ?? "article-content";
            options.PollInterval = TimeSpan.FromMilliseconds(configuration.GetValue<int?>("Typesense:PollIntervalMilliseconds") ?? 2000);
            options.DraftDebounce = TimeSpan.FromMilliseconds(configuration.GetValue<int?>("Typesense:DraftDebounceMilliseconds") ?? 3000);
            options.MaxRetries = configuration.GetValue<int?>("Typesense:MaxRetries") ?? 8;
        });
        services.AddSingleton<ISlugGenerator, SlugGenerator>();
        services.AddSingleton(TimeProvider.System);
        return services;
    }
}
