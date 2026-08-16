using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Search;

internal static class SearchIndexJobQueue
{
    public static Task EnqueueArticleAsync(KbDbContext dbContext, Guid articleId, string jobType,
        DateTime availableAt, CancellationToken cancellationToken) => EnqueueAsync(dbContext,
        SearchIndexScopes.Internal, SearchIndexTargets.Article, articleId, null, jobType, availableAt, cancellationToken);

    public static Task EnqueueCategoryAsync(KbDbContext dbContext, Guid categoryId, string jobType,
        DateTime availableAt, CancellationToken cancellationToken) => EnqueueAsync(dbContext,
        SearchIndexScopes.Internal, SearchIndexTargets.Category, null, categoryId, jobType, availableAt, cancellationToken);

    private static async Task EnqueueAsync(KbDbContext dbContext, string indexScope, string targetType, Guid? articleId,
        Guid? categoryId, string jobType, DateTime availableAt, CancellationToken token)
    {
        var local = dbContext.SearchIndexJobs.Local.FirstOrDefault(job =>
            job.IndexScope == indexScope && job.TargetType == targetType &&
            job.ArticleIdFk == articleId && job.CategoryIdFk == categoryId && job.Status == JobStatuses.Pending);
        var pending = local ?? await dbContext.SearchIndexJobs.FirstOrDefaultAsync(job =>
            job.IndexScope == indexScope && job.TargetType == targetType &&
            job.ArticleIdFk == articleId && job.CategoryIdFk == categoryId && job.Status == JobStatuses.Pending, token);
        if (pending is not null)
        {
            pending.JobType = jobType;
            pending.AvailableAt = availableAt;
            pending.CreatedAt = availableAt;
            pending.RetryCount = 0;
            pending.ErrorMessage = null;
            return;
        }
        dbContext.SearchIndexJobs.Add(new SearchIndexJob
        {
            SearchJobId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
            ArticleIdFk = articleId,
            CategoryIdFk = categoryId,
            TargetType = targetType,
            IndexScope = indexScope,
            JobType = jobType,
            Status = JobStatuses.Pending,
            AvailableAt = availableAt,
            CreatedAt = availableAt
        });
    }
}
