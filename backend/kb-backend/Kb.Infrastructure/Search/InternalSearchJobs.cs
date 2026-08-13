using Kb.Application.Search;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kb.Infrastructure.Search;

internal sealed class InternalSearchSynchronization
{
    public SemaphoreSlim Gate { get; } = new(1, 1);
}

internal sealed class InternalSearchMaintenance(
    InternalSearchDocumentSource source,
    ITypesenseInternalIndex index,
    InternalSearchSynchronization synchronization) : IInternalSearchMaintenance
{
    public async Task<InternalSearchRebuildResult> RebuildAsync(CancellationToken cancellationToken)
    {
        await synchronization.Gate.WaitAsync(cancellationToken);
        try
        {
            var documents = await source.GetAllAsync(cancellationToken);
            var collection = await index.RebuildAsync(documents, cancellationToken);
            return new InternalSearchRebuildResult(collection,
                documents.Count(document => document.RecordType == "article"),
                documents.Count(document => document.RecordType == "category"));
        }
        finally { synchronization.Gate.Release(); }
    }
}

internal sealed class InternalSearchJobWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<InternalSearchOptions> options,
    TimeProvider timeProvider,
    InternalSearchSynchronization synchronization,
    ILogger<InternalSearchJobWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            if (string.IsNullOrWhiteSpace(options.Value.Endpoint) || string.IsNullOrWhiteSpace(options.Value.AdminApiKey))
            {
                await Task.Delay(options.Value.PollInterval, timeProvider, stoppingToken);
                continue;
            }
            var processed = false;
            try
            {
                await synchronization.Gate.WaitAsync(stoppingToken);
                try { processed = await ProcessOneAsync(stoppingToken); }
                finally { synchronization.Gate.Release(); }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { logger.LogError(exception, "Internal search job polling failed."); }
            if (!processed) await Task.Delay(options.Value.PollInterval, timeProvider, stoppingToken);
        }
    }

    private async Task<bool> ProcessOneAsync(CancellationToken token)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KbDbContext>();
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var id = await db.SearchIndexJobs.AsNoTracking()
            .Where(job => job.IndexScope == SearchIndexScopes.Internal &&
                          (job.Status == JobStatuses.Pending && job.AvailableAt <= now ||
                           job.Status == JobStatuses.Processing && job.ProcessedAt <= now.AddMinutes(-10)))
            .OrderBy(job => job.AvailableAt).Select(job => (Guid?)job.SearchJobId).FirstOrDefaultAsync(token);
        if (id is null) return false;
        var staleBefore = now.AddMinutes(-10);
        var claimed = await db.SearchIndexJobs.Where(job => job.SearchJobId == id &&
                (job.Status == JobStatuses.Pending || job.Status == JobStatuses.Processing && job.ProcessedAt <= staleBefore))
            .ExecuteUpdateAsync(setters => setters.SetProperty(job => job.Status, JobStatuses.Processing)
                .SetProperty(job => job.ProcessedAt, now), token);
        if (claimed != 1) return true;
        var job = await db.SearchIndexJobs.SingleAsync(item => item.SearchJobId == id, token);
        try
        {
            var source = scope.ServiceProvider.GetRequiredService<InternalSearchDocumentSource>();
            var index = scope.ServiceProvider.GetRequiredService<ITypesenseInternalIndex>();
            if (job.TargetType == SearchIndexTargets.Article && job.ArticleIdFk is { } articleId)
            {
                var document = job.JobType == SearchIndexJobTypes.Delete ? null : await source.GetArticleAsync(articleId, token);
                if (document is null) await index.DeleteAsync($"article_{articleId:N}", token);
                else await index.UpsertAsync(document, token);
            }
            else if (job.TargetType == SearchIndexTargets.Category && job.CategoryIdFk is { } categoryId)
            {
                var document = job.JobType == SearchIndexJobTypes.Delete ? null : await source.GetCategoryAsync(categoryId, token);
                if (document is null) await index.DeleteAsync($"category_{categoryId:N}", token);
                else await index.UpsertAsync(document, token);
            }
            else throw new InvalidOperationException("The search index job target is invalid.");
            job.Status = JobStatuses.Completed;
            job.ProcessedAt = timeProvider.GetUtcNow().UtcDateTime;
            job.ErrorMessage = null;
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            job.Status = JobStatuses.Pending;
            job.ProcessedAt = null;
            job.AvailableAt = now;
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
        catch (Exception exception)
        {
            job.RetryCount++;
            job.ErrorMessage = exception.Message[..Math.Min(1000, exception.Message.Length)];
            job.Status = job.RetryCount >= options.Value.MaxRetries ? JobStatuses.Failed : JobStatuses.Pending;
            job.ProcessedAt = null;
            job.AvailableAt = now.AddSeconds(Math.Min(300, Math.Pow(2, job.RetryCount)));
            logger.LogWarning(exception, "Internal search job {SearchJobId} failed on attempt {RetryCount}.",
                job.SearchJobId, job.RetryCount);
        }
        await db.SaveChangesAsync(CancellationToken.None);
        return true;
    }
}
