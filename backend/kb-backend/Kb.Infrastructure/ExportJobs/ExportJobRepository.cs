using System.Data;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.ExportJobs;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.ExportJobs;

public sealed class ExportJobRepository(KbDbContext db) : IExportJobRepository
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Task<ExportJobData> CreateArticleAsync(Guid articleId, string exportType, Guid requestedBy,
        DateTime requestedAt, CancellationToken cancellationToken) => InTransactionAsync(async token =>
    {
        await EnsureActiveUserAsync(requestedBy, token);
        var article = await db.Articles.AsNoTracking()
            .Where(item => item.ArticleId == articleId && item.DeletedAt == null &&
                           item.Status != ArticleStatuses.Deleted)
            .Select(item => new
            {
                item.ArticleId, item.Title, item.Slug, item.CategoryIdFk, item.Position,
                Version = item.LastPublishedVersionIdFkNavigation
            }).SingleOrDefaultAsync(token) ?? throw new NotFoundException("The article was not found.");
        if (article.Version is null || article.Version.PublishedAt is null)
            throw new BusinessRuleException("The article has no published stable version to export.");

        var duplicate = await FindDuplicateAsync(ExportEntityTypes.Article, articleId, null,
            exportType, requestedBy, token);
        if (duplicate is not null) return duplicate;

        var snapshot = new ExportSnapshot(ExportEntityTypes.Article, article.Title, article.Slug, [],
        [
            new(article.ArticleId, article.Version.VersionId, article.CategoryIdFk, article.Title,
                article.Slug, article.Position, article.Version.ContentJsonStoragePath,
                article.Version.RenderedHtmlStoragePath, article.Version.PlainTextStoragePath,
                article.Version.PublishedAt)
        ]);
        var entity = NewJob(ExportEntityTypes.Article, articleId, null, article.Version.VersionId,
            exportType, requestedBy, requestedAt, snapshot, FileName(article.Slug, exportType));
        db.ExportJobs.Add(entity);
        await db.SaveChangesAsync(token);
        return await RequiredAsync(entity.ExportJobId, token);
    }, cancellationToken);

    public Task<ExportJobData> CreateCategoryAsync(Guid categoryId, string exportType, Guid requestedBy,
        DateTime requestedAt, CancellationToken cancellationToken) => InTransactionAsync(async token =>
    {
        await EnsureActiveUserAsync(requestedBy, token);
        var categories = await db.Categories.AsNoTracking().ToListAsync(token);
        var root = categories.SingleOrDefault(item => item.CategoryId == categoryId)
            ?? throw new NotFoundException("The category was not found.");
        var included = Descendants(root, categories);
        var categoryIds = included.Select(item => item.CategoryId).ToHashSet();
        var articles = await db.Articles.AsNoTracking()
            .Where(item => item.CategoryIdFk != null && categoryIds.Contains(item.CategoryIdFk.Value) &&
                           item.DeletedAt == null && item.Status != ArticleStatuses.Deleted)
            .Select(item => new
            {
                item.ArticleId, item.Title, item.Slug, item.CategoryIdFk, item.Position,
                Version = item.LastPublishedVersionIdFkNavigation
            }).ToListAsync(token);
        var unstable = articles.Where(item => item.Version is null || item.Version.PublishedAt is null)
            .Select(item => item.Title).Order().Take(5).ToArray();
        if (unstable.Length > 0)
            throw new BusinessRuleException(
                $"The category contains article(s) without a published stable version: {string.Join(", ", unstable)}.");

        var duplicate = await FindDuplicateAsync(ExportEntityTypes.Category, null, categoryId,
            exportType, requestedBy, token);
        if (duplicate is not null) return duplicate;

        var snapshot = new ExportSnapshot(ExportEntityTypes.Category, root.Name, root.Slug,
            included.Select(item => new ExportSnapshotCategory(item.CategoryId, item.ParentCategoryIdFk,
                item.Name, item.Slug, item.SortOrder, item.Depth)).ToArray(),
            articles.Select(item => new ExportSnapshotArticle(item.ArticleId, item.Version!.VersionId,
                item.CategoryIdFk, item.Title, item.Slug, item.Position,
                item.Version.ContentJsonStoragePath, item.Version.RenderedHtmlStoragePath,
                item.Version.PlainTextStoragePath, item.Version.PublishedAt)).ToArray());
        var entity = NewJob(ExportEntityTypes.Category, null, categoryId, null, exportType,
            requestedBy, requestedAt, snapshot, FileName(root.Slug, exportType));
        db.ExportJobs.Add(entity);
        await db.SaveChangesAsync(token);
        return await RequiredAsync(entity.ExportJobId, token);
    }, cancellationToken);

    public Task<ExportJobData?> GetAsync(Guid jobId, CancellationToken cancellationToken) =>
        Project(db.ExportJobs.AsNoTracking().Where(item => item.ExportJobId == jobId))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<bool> IsActiveUserAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking().AnyAsync(item => item.UserId == userId && item.IsActive,
            cancellationToken);

    public Task<ExportJobData?> ClaimNextAsync(DateTime startedAt, CancellationToken cancellationToken) =>
        InTransactionAsync<ExportJobData?>(async token =>
        {
            var staleBefore = startedAt.AddHours(-2);
            await db.ExportJobs
                .Where(item => item.Status == JobStatuses.Processing && item.StartedAt < staleBefore)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(item => item.Status, JobStatuses.Failed)
                    .SetProperty(item => item.CompletedAt, startedAt)
                    .SetProperty(item => item.ErrorMessage,
                        "The export worker stopped before this job completed. Request the export again."), token);
            var entity = await db.ExportJobs.OrderBy(item => item.RequestedAt)
                .ThenBy(item => item.ExportJobId)
                .FirstOrDefaultAsync(item => item.Status == JobStatuses.Pending, token);
            if (entity is null) return null;
            entity.Status = JobStatuses.Processing;
            entity.StartedAt = startedAt;
            entity.ErrorMessage = null;
            await db.SaveChangesAsync(token);
            return await RequiredAsync(entity.ExportJobId, token);
        }, cancellationToken);

    public async Task CompleteAsync(Guid jobId, string resultPath, DateTime completedAt,
        CancellationToken cancellationToken)
    {
        var entity = await db.ExportJobs.SingleAsync(item => item.ExportJobId == jobId, cancellationToken);
        entity.Status = JobStatuses.Completed;
        entity.ResultPath = resultPath;
        entity.ErrorMessage = null;
        entity.CompletedAt = completedAt;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task FailAsync(Guid jobId, string errorMessage, DateTime completedAt,
        CancellationToken cancellationToken)
    {
        var entity = await db.ExportJobs.SingleAsync(item => item.ExportJobId == jobId, cancellationToken);
        entity.Status = JobStatuses.Failed;
        entity.ResultPath = null;
        entity.ErrorMessage = errorMessage.Length <= 2000 ? errorMessage : errorMessage[..2000];
        entity.CompletedAt = completedAt;
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<ExportJobData?> FindDuplicateAsync(string entityType, Guid? articleId,
        Guid? categoryId, string exportType, Guid userId, CancellationToken token) =>
        await Project(db.ExportJobs.AsNoTracking().Where(item => item.EntityType == entityType &&
            item.ArticleIdFk == articleId && item.CategoryIdFk == categoryId &&
            item.ExportType == exportType && item.RequestedByFk == userId &&
            (item.Status == JobStatuses.Pending || item.Status == JobStatuses.Processing))
            .OrderByDescending(item => item.RequestedAt))
            .FirstOrDefaultAsync(token);

    private async Task EnsureActiveUserAsync(Guid userId, CancellationToken token)
    {
        if (!await db.Users.AsNoTracking().AnyAsync(item => item.UserId == userId && item.IsActive, token))
            throw new ForbiddenException("The authenticated user is not active.");
    }

    private static List<Category> Descendants(Category root, IReadOnlyList<Category> all)
    {
        var result = new List<Category>();
        Add(root);
        return result;
        void Add(Category category)
        {
            result.Add(category);
            foreach (var child in all.Where(item => item.ParentCategoryIdFk == category.CategoryId)
                         .OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ThenBy(item => item.CategoryId))
                Add(child);
        }
    }

    private ExportJob NewJob(string entityType, Guid? articleId, Guid? categoryId, Guid? versionId,
        string exportType, Guid requestedBy, DateTime requestedAt, ExportSnapshot snapshot, string fileName) => new()
    {
        ExportJobId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
        EntityType = entityType,
        ArticleIdFk = articleId,
        CategoryIdFk = categoryId,
        VersionIdFk = versionId,
        ExportType = exportType,
        Status = JobStatuses.Pending,
        RequestedByFk = requestedBy,
        RequestedAt = requestedAt,
        SnapshotJson = JsonSerializer.Serialize(snapshot, JsonOptions),
        FileName = fileName
    };

    private Task<ExportJobData> RequiredAsync(Guid id, CancellationToken token) =>
        Project(db.ExportJobs.AsNoTracking().Where(item => item.ExportJobId == id)).SingleAsync(token);

    private static IQueryable<ExportJobData> Project(IQueryable<ExportJob> source) =>
        source.Select(item => new ExportJobData(item.ExportJobId, item.EntityType, item.ArticleIdFk,
            item.CategoryIdFk, item.VersionIdFk, item.ExportType, item.Status, item.RequestedByFk,
            item.RequestedByFkNavigation.FullName, item.RequestedAt, item.StartedAt, item.CompletedAt,
            item.SnapshotJson, item.FileName, item.ResultPath, item.ErrorMessage));

    private static string FileName(string slug, string exportType)
    {
        var safe = new string(slug.Trim().ToLowerInvariant().Select(character =>
            char.IsLetterOrDigit(character) || character is '-' or '_' ? character : '-').ToArray()).Trim('-');
        if (string.IsNullOrWhiteSpace(safe)) safe = "knowledge-base-export";
        return $"{safe[..Math.Min(safe.Length, 220)]}.{(exportType == ExportTypes.Pdf ? "pdf" : "html")}";
    }

    private async Task<T> InTransactionAsync<T>(Func<CancellationToken, Task<T>> action,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable,
            cancellationToken);
        try
        {
            var result = await action(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            db.ChangeTracker.Clear();
            throw;
        }
    }
}
