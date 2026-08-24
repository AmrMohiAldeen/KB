using Kb.Application.Categories;
using Kb.Application.Articles;
using Kb.Application.Audit;
using Kb.Application.Drafts;
using Kb.Application.Media;
using Kb.Application.Lifecycle;
using Kb.Application.Comments;
using Kb.Application.Dashboard;
using Kb.Application.Migrations.HelpJuice;
using Kb.Application.Notifications;
using Kb.Application.ExportJobs;
using Kb.Application.Search;
using Kb.Application.Public;
using Kb.Application.Viewer;
using Kb.Application.Users;
using Kb.Application.Languages;
using Kb.Application.Translations;
using Microsoft.Extensions.DependencyInjection;

namespace Kb.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<CategoryService>();
        services.AddScoped<ArticleService>();
        services.AddScoped<ArticleDraftService>();
        services.AddScoped<AuditLogService>();
        services.AddScoped<MediaService>();
        services.AddScoped<ArticleLifecycleService>();
        services.AddScoped<ArticleCommentService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<DashboardBulkService>();
        services.AddScoped<HelpJuiceMigrationService>();
        services.AddScoped<HelpJuiceUserMigrationService>();
        services.AddScoped<NotificationService>();
        services.AddScoped<ExportService>();
        services.AddScoped<ExportJobProcessor>();
        services.AddScoped<ExportDocumentBuilder>();
        services.AddScoped<InternalSearchService>();
        services.AddScoped<PublicKnowledgeBaseService>();
        services.AddScoped<ViewerService>();
        services.AddScoped<ViewerDashboardSettingsService>();
        services.AddScoped<UserService>();
        services.AddScoped<LanguageService>();
        services.AddScoped<ArticleTranslationService>();
        services.AddScoped<ProtectedTranslationTermService>();
        services.AddScoped<AutomaticArticleTranslationService>();
        return services;
    }
}
