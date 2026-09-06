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

    public Task<ExportJobData> CreateArticleAsync(Guid articleId, ExportArticleSource source,
        string exportType, Guid requestedBy,
        DateTime requestedAt, CancellationToken cancellationToken) => InTransactionAsync(async token =>
    {
        await EnsureActiveUserAsync(requestedBy, token);
        var normalizedSourceType = NormalizeSource(source);
        var article = await db.Articles.AsNoTracking()
            .Where(item => item.ArticleId == articleId && item.DeletedAt == null &&
                           item.Status != ArticleStatuses.Deleted)
            .Select(item => new
            {
                item.ArticleId, item.Title, item.Slug, item.LocaleCode, item.CategoryIdFk, item.Position
            }).SingleOrDefaultAsync(token) ?? throw new NotFoundException("The article was not found.");

        SourceRecord selected;
        if (normalizedSourceType == ExportSourceTypes.Draft)
        {
            selected = await db.ArticleDrafts.AsNoTracking()
                .Where(item => item.DraftId == source.DraftId && item.ArticleIdFk == articleId)
                .Select(item => new SourceRecord(item.DraftId, item.ContentJsonStoragePath,
                    item.RenderedHtmlStoragePath, item.PlainTextStoragePath, null))
                .SingleOrDefaultAsync(token)
                ?? throw new NotFoundException("The selected article draft was not found.");
        }
        else
        {
            selected = await db.ArticleVersions.AsNoTracking()
                .Where(item => item.VersionId == source.VersionId && item.ArticleIdFk == articleId)
                .Select(item => new SourceRecord(item.VersionId, item.ContentJsonStoragePath,
                    item.RenderedHtmlStoragePath, item.PlainTextStoragePath, item.PublishedAt))
                .SingleOrDefaultAsync(token)
                ?? throw new NotFoundException("The selected article version was not found.");
        }
        if (string.IsNullOrWhiteSpace(selected.ContentJsonPath))
            throw new BusinessRuleException("The selected export source has no stored content.");

        var duplicate = await FindDuplicateAsync(ExportEntityTypes.Article, articleId, null,
            normalizedSourceType, source.DraftId, source.VersionId, exportType, requestedBy, token);
        if (duplicate is not null) return duplicate;

        var isRtl = await db.KbLanguages.AsNoTracking().Where(language =>
                language.LocaleCode == article.LocaleCode && language.IsEnabled)
            .Select(language => (bool?)language.IsRtl).SingleOrDefaultAsync(token) ?? false;
        var snapshot = new ExportSnapshot(ExportEntityTypes.Article, article.Title, article.Slug, [],
        [
            new(article.ArticleId, normalizedSourceType, source.DraftId, source.VersionId,
                article.CategoryIdFk, article.Title, article.Slug, article.Position,
                selected.ContentJsonPath, selected.RenderedHtmlPath, selected.PlainTextPath,
                selected.PublishedAt, LocaleCode: article.LocaleCode)
        ], article.LocaleCode, isRtl);
        var entity = NewJob(ExportEntityTypes.Article, articleId, null, normalizedSourceType,
            source.DraftId, source.VersionId, exportType, requestedBy, requestedAt, snapshot,
            FileName(article.Slug, exportType));
        db.ExportJobs.Add(entity);
        await db.SaveChangesAsync(token);
        return await RequiredAsync(entity.ExportJobId, token);
    }, cancellationToken);

    public Task<ExportJobData> CreateCategoryAsync(Guid categoryId, string exportType, Guid requestedBy,
        DateTime requestedAt, CancellationToken cancellationToken, string? localeCode = null) => InTransactionAsync(async token =>
    {
        await EnsureActiveUserAsync(requestedBy, token);
        var locale = await ResolveExportLocaleAsync(localeCode, token);
        var categories = await db.Categories.AsNoTracking().ToListAsync(token);
        var root = categories.SingleOrDefault(item => item.CategoryId == categoryId)
            ?? throw new NotFoundException("The category was not found.");
        var included = Descendants(root, categories);
        var categoryIds = included.Select(item => item.CategoryId).ToHashSet();
        var articles = await db.Articles.AsNoTracking()
            .Where(item => (item.CategoryIdFk != null && categoryIds.Contains(item.CategoryIdFk.Value) ||
                            item.ArticleCategories.Any(link => categoryIds.Contains(link.CategoryIdFk))) &&
                           item.DeletedAt == null && item.Status != ArticleStatuses.Deleted &&
                           item.LocaleCode == locale.Code)
            .Select(item => new
            {
                item.ArticleId, item.Title, item.Slug, item.LocaleCode, item.CategoryIdFk, item.Position,
                item.Status, item.CurrentDraftIdFk, item.LastPublishedVersionIdFk,
                CategoryIds = item.ArticleCategories.OrderBy(link => link.SortOrder)
                    .Select(link => link.CategoryIdFk).ToArray(),
                ExportCategoryId = item.ArticleCategories.Where(link => categoryIds.Contains(link.CategoryIdFk))
                    .OrderBy(link => link.SortOrder).Select(link => (Guid?)link.CategoryIdFk).FirstOrDefault()
            }).ToListAsync(token);

        var articleIds = articles.Select(item => item.ArticleId).ToArray();
        var drafts = await db.ArticleDrafts.AsNoTracking()
            .Where(item => articleIds.Contains(item.ArticleIdFk))
            .Select(item => new
            {
                item.ArticleIdFk,
                Source = new SourceRecord(item.DraftId, item.ContentJsonStoragePath,
                    item.RenderedHtmlStoragePath, item.PlainTextStoragePath, null),
                item.DraftNumber,
                item.UpdatedAt
            }).ToListAsync(token);
        var versions = await db.ArticleVersions.AsNoTracking()
            .Where(item => articleIds.Contains(item.ArticleIdFk))
            .Select(item => new
            {
                item.ArticleIdFk,
                Source = new SourceRecord(item.VersionId, item.ContentJsonStoragePath,
                    item.RenderedHtmlStoragePath, item.PlainTextStoragePath, item.PublishedAt),
                item.VersionNumber,
                item.CreatedAt
            }).ToListAsync(token);

        var selected = articles.Select(article =>
        {
            var publishedVersion = article.Status == ArticleStatuses.Published &&
                                   article.LastPublishedVersionIdFk is { } publishedVersionId
                ? versions.Where(item => item.ArticleIdFk == article.ArticleId &&
                                         item.Source.Id == publishedVersionId)
                    .Select(item => item.Source)
                    .SingleOrDefault()
                : null;
            var draft = drafts.Where(item => item.ArticleIdFk == article.ArticleId)
                .OrderByDescending(item => item.Source.Id == article.CurrentDraftIdFk)
                .ThenByDescending(item => item.DraftNumber)
                .ThenByDescending(item => item.UpdatedAt)
                .Select(item => item.Source)
                .FirstOrDefault(item => !string.IsNullOrWhiteSpace(item.ContentJsonPath));
            var version = versions.Where(item => item.ArticleIdFk == article.ArticleId)
                .OrderByDescending(item => item.VersionNumber)
                .ThenByDescending(item => item.CreatedAt)
                .Select(item => item.Source)
                .FirstOrDefault(item => !string.IsNullOrWhiteSpace(item.ContentJsonPath));
            var source = publishedVersion ?? draft ?? version;
            return new
            {
                Article = article,
                SourceType = publishedVersion is not null || draft is null
                    ? ExportSourceTypes.Version
                    : ExportSourceTypes.Draft,
                Source = source
            };
        }).ToArray();
        var unavailable = selected.Where(item => item.Source is null).Select(item => item.Article.Title)
            .Order().Take(5).ToArray();
        if (unavailable.Length > 0)
            throw new BusinessRuleException(
                $"Category export could not find stored draft or version content for: {string.Join(", ", unavailable)}.");

        var duplicate = await FindDuplicateAsync(ExportEntityTypes.Category, null, categoryId,
            null, null, null, exportType, requestedBy, token);
        if (duplicate is not null) return duplicate;

        var categoryNames = await LocalizedCategoryNamesAsync(included.Select(item => item.CategoryId), locale.Code, token);
        var snapshot = new ExportSnapshot(ExportEntityTypes.Category,
            categoryNames.GetValueOrDefault(root.CategoryId, root.Name), root.Slug,
            included.Select(item => new ExportSnapshotCategory(item.CategoryId, item.ParentCategoryIdFk,
                categoryNames.GetValueOrDefault(item.CategoryId, item.Name), item.Slug, item.SortOrder, item.Depth)).ToArray(),
            selected.Select(item => new ExportSnapshotArticle(item.Article.ArticleId, item.SourceType,
                item.SourceType == ExportSourceTypes.Draft ? item.Source!.Id : null,
                item.SourceType == ExportSourceTypes.Version ? item.Source!.Id : null,
                item.Article.ExportCategoryId ?? item.Article.CategoryIdFk, item.Article.Title, item.Article.Slug, item.Article.Position,
                item.Source!.ContentJsonPath, item.Source.RenderedHtmlPath,
                item.Source.PlainTextPath, item.Source.PublishedAt, item.Article.CategoryIds,
                item.Article.LocaleCode)).ToArray(), locale.Code, locale.IsRtl);
        var entity = NewJob(ExportEntityTypes.Category, null, categoryId, null, null, null, exportType,
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

    public Task<ExportJobData?> ClaimNextAsync(DateTime startedAt, TimeSpan staleAfter,
        CancellationToken cancellationToken) =>
        InTransactionAsync<ExportJobData?>(async token =>
        {
            var staleBefore = startedAt.Subtract(staleAfter);
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
        Guid? categoryId, string? sourceType, Guid? draftId, Guid? versionId, string exportType,
        Guid userId, CancellationToken token) =>
        await Project(db.ExportJobs.AsNoTracking().Where(item => item.EntityType == entityType &&
            item.ArticleIdFk == articleId && item.CategoryIdFk == categoryId &&
            item.SourceType == sourceType && item.DraftIdFk == draftId && item.VersionIdFk == versionId &&
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

    private ExportJob NewJob(string entityType, Guid? articleId, Guid? categoryId, string? sourceType,
        Guid? draftId, Guid? versionId,
        string exportType, Guid requestedBy, DateTime requestedAt, ExportSnapshot snapshot, string fileName) => new()
    {
        ExportJobId = db.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
        EntityType = entityType,
        ArticleIdFk = articleId,
        CategoryIdFk = categoryId,
        SourceType = sourceType,
        DraftIdFk = draftId,
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
            item.CategoryIdFk, item.SourceType, item.DraftIdFk, item.VersionIdFk, item.ExportType,
            item.Status, item.RequestedByFk,
            item.RequestedByFkNavigation.FullName, item.RequestedAt, item.StartedAt, item.CompletedAt,
            item.SnapshotJson, item.FileName, item.ResultPath, item.ErrorMessage));

    private static string FileName(string slug, string exportType)
    {
        var safe = new string(slug.Trim().ToLowerInvariant().Select(character =>
            char.IsLetterOrDigit(character) || character is '-' or '_' ? character : '-').ToArray()).Trim('-');
        if (string.IsNullOrWhiteSpace(safe)) safe = "knowledge-base-export";
        return $"{safe[..Math.Min(safe.Length, 220)]}.{(exportType == ExportTypes.Pdf ? "pdf" : "html")}";
    }

    private static string NormalizeSource(ExportArticleSource source)
    {
        var isDraft = string.Equals(source.SourceType, ExportSourceTypes.Draft, StringComparison.OrdinalIgnoreCase);
        var isVersion = string.Equals(source.SourceType, ExportSourceTypes.Version, StringComparison.OrdinalIgnoreCase);
        if (isDraft && source.DraftId is { } draftId && draftId != Guid.Empty && source.VersionId is null)
            return ExportSourceTypes.Draft;
        if (isVersion && source.VersionId is { } versionId && versionId != Guid.Empty && source.DraftId is null)
            return ExportSourceTypes.Version;
        throw new BusinessRuleException(
            "Select exactly one valid export source: a DraftID for Draft or a VersionID for Version.");
    }

    private sealed record SourceRecord(Guid Id, string ContentJsonPath, string? RenderedHtmlPath,
        string? PlainTextPath, DateTime? PublishedAt);

    private async Task<(string Code, bool IsRtl)> ResolveExportLocaleAsync(string? requestedLocale,
        CancellationToken token)
    {
        var code = string.IsNullOrWhiteSpace(requestedLocale) ? null : requestedLocale.Trim().ToLowerInvariant();
        var language = await db.KbLanguages.AsNoTracking().Where(item => item.IsEnabled &&
                (code == null ? item.IsDefault : item.LocaleCode == code))
            .OrderByDescending(item => item.IsDefault).Select(item => new { item.LocaleCode, item.IsRtl })
            .FirstOrDefaultAsync(token);
        if (language is not null) return (language.LocaleCode, language.IsRtl);
        if (code is null) return (KbLocales.DefaultLocaleCode, false);
        throw new NotFoundException("The export language is not enabled.");
    }

    private async Task<Dictionary<Guid, string>> LocalizedCategoryNamesAsync(IEnumerable<Guid> categoryIds,
        string localeCode, CancellationToken token)
    {
        var ids = categoryIds.Distinct().ToArray();
        return await db.Categories.AsNoTracking().Where(item => ids.Contains(item.CategoryId)).ToDictionaryAsync(
            item => item.CategoryId,
            item => item.CategoryLocalizations.Where(localization => localization.LocaleCode == localeCode)
                .Select(localization => localization.Name).FirstOrDefault() ?? item.Name, token);
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
