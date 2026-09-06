using System.Data;
using Kb.Application.Categories;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Kb.Infrastructure.Search;

namespace Kb.Infrastructure.Categories;

public sealed class CategoryRepository(KbDbContext dbContext) : ICategoryRepository
{
    public async Task<T> ExecuteSerializableAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var result = await operation(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    public Task<CategoryData?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().Where(category => category.CategoryId == id)
            .Select(category => new CategoryData(
                category.CategoryId,
                category.ParentCategoryIdFk,
                category.Name,
                category.Slug,
                category.Description,
                category.SortOrder,
                category.Path,
                category.Depth,
                category.Articles.Count(article =>
                    article.DeletedAt == null && article.Status != ArticleStatuses.Deleted &&
                    article.Status != ArticleStatuses.Archived),
                category.Status,
                category.Visibility,
                category.ViewerImageMediaIdFk,
                category.ViewerIcon,
                category.CategoryLocalizations.OrderBy(localization => localization.LocaleCode)
                    .Select(localization => new CategoryLocalizationData(localization.LocaleCode, localization.Name,
                        localization.Description)).ToList()))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<CategoryData>> GetAllAsync(CancellationToken cancellationToken) =>
        await dbContext.Categories.AsNoTracking()
            .Select(category => new CategoryData(
                category.CategoryId,
                category.ParentCategoryIdFk,
                category.Name,
                category.Slug,
                category.Description,
                category.SortOrder,
                category.Path,
                category.Depth,
                category.Articles.Count(article =>
                    article.DeletedAt == null && article.Status != ArticleStatuses.Deleted &&
                    article.Status != ArticleStatuses.Archived),
                category.Status,
                category.Visibility,
                category.ViewerImageMediaIdFk,
                category.ViewerIcon,
                category.CategoryLocalizations.OrderBy(localization => localization.LocaleCode)
                    .Select(localization => new CategoryLocalizationData(localization.LocaleCode, localization.Name,
                        localization.Description)).ToList()))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<CategoryData>> GetDescendantsAsync(string pathPrefix, Guid categoryId, CancellationToken cancellationToken) =>
        await dbContext.Categories.AsNoTracking()
            .Where(category => category.CategoryId != categoryId && category.Path != null && category.Path.StartsWith(pathPrefix))
            .Select(category => Map(category)).ToListAsync(cancellationToken);

    public Task<bool> SlugExistsAsync(string slug, Guid? excludingId, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().AnyAsync(
            category => category.Slug == slug && (!excludingId.HasValue || category.CategoryId != excludingId.Value),
            cancellationToken);

    public Task<bool> HasChildrenAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().AnyAsync(category => category.ParentCategoryIdFk == id, cancellationToken);

    public Task<bool> HasArticlesAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking().AnyAsync(article => article.CategoryIdFk == id ||
            article.ArticleCategories.Any(link => link.CategoryIdFk == id), cancellationToken);

    public Task<bool> IsActiveImageMediaAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.MediaFiles.AsNoTracking().AnyAsync(media => media.MediaId == id &&
            media.Status == MediaStatuses.Active && media.MimeType.StartsWith("image/"), cancellationToken);

    public async Task<IReadOnlyList<CategoryLocalizationLanguageData>> GetEnabledLocalizationLanguagesAsync(
        CancellationToken cancellationToken) =>
        await dbContext.KbLanguages.AsNoTracking().Where(language => language.IsEnabled)
            .OrderByDescending(language => language.IsDefault).ThenBy(language => language.SortOrder)
            .ThenBy(language => language.LocaleCode)
            .Select(language => new CategoryLocalizationLanguageData(language.LocaleCode, language.DisplayName,
                language.NativeName, language.IsDefault, language.IsRtl, language.SortOrder))
            .ToListAsync(cancellationToken);

    public async Task<CategoryData> InsertAsync(NewCategoryData category, CancellationToken cancellationToken)
    {
        var entity = new Category
        {
            CategoryId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
            ParentCategoryIdFk = category.ParentCategoryId,
            Name = category.Name,
            Slug = category.Slug,
            Description = category.Description,
            SortOrder = category.SortOrder,
            Path = null,
            Depth = category.Depth,
            Visibility = category.Visibility,
            ViewerImageMediaIdFk = category.ViewerImageMediaId,
            ViewerIcon = category.ViewerIcon
        };
        dbContext.Categories.Add(entity);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsSlugUniquenessViolation(exception))
        {
            dbContext.Entry(entity).State = EntityState.Detached;
            throw new ConflictException("The category slug was allocated concurrently. Retry the request.");
        }
        return Map(entity);
    }

    public async Task<CategoryData> SetPathAndAuditAsync(Guid id, string path, int depth, AuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.SingleAsync(category => category.CategoryId == id, cancellationToken);
        entity.Path = path;
        entity.Depth = depth;
        AddAudit(id, audit);
        await SearchIndexJobQueue.EnqueueCategoryAsync(dbContext, id, SearchIndexJobTypes.Upsert, audit.CreatedAt, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(entity);
    }

    public async Task<CategoryData> UpdateAndAuditAsync(Guid id, string name, string slug, string? description, int sortOrder,
        string visibility, Guid? viewerImageMediaId, string? viewerIcon, AuditData audit,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.Include(category => category.CategoryLocalizations)
            .SingleAsync(category => category.CategoryId == id, cancellationToken);
        entity.Name = name;
        entity.Slug = slug;
        entity.Description = description;
        entity.SortOrder = sortOrder;
        entity.Visibility = visibility;
        entity.ViewerImageMediaIdFk = viewerImageMediaId;
        entity.ViewerIcon = viewerIcon;
        var defaultLocale = await dbContext.KbLanguages.AsNoTracking()
            .Where(language => language.IsEnabled && language.IsDefault).Select(language => language.LocaleCode)
            .SingleOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(defaultLocale))
        {
            var defaultLocalization = entity.CategoryLocalizations.SingleOrDefault(localization =>
                string.Equals(localization.LocaleCode, defaultLocale, StringComparison.OrdinalIgnoreCase));
            if (defaultLocalization is null)
                entity.CategoryLocalizations.Add(new CategoryLocalization
                {
                    CategoryId = entity.CategoryId, LocaleCode = defaultLocale, Name = name, Description = description
                });
            else
            {
                defaultLocalization.Name = name;
                defaultLocalization.Description = description;
            }
        }
        AddAudit(id, audit);
        var affectedIds = string.IsNullOrWhiteSpace(entity.Path)
            ? [id]
            : await dbContext.Categories.AsNoTracking()
                .Where(category => category.Path != null && category.Path.StartsWith(entity.Path))
                .Select(category => category.CategoryId).ToArrayAsync(cancellationToken);
        foreach (var affectedId in affectedIds)
            await SearchIndexJobQueue.EnqueueCategoryAsync(dbContext, affectedId, SearchIndexJobTypes.Upsert,
                audit.CreatedAt, cancellationToken);
        var affectedArticleIds = await dbContext.Articles.AsNoTracking()
            .Where(article => (article.CategoryIdFk.HasValue && affectedIds.Contains(article.CategoryIdFk.Value) ||
                               article.ArticleCategories.Any(link => affectedIds.Contains(link.CategoryIdFk))) &&
                              article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)
            .Select(article => article.ArticleId).ToArrayAsync(cancellationToken);
        foreach (var articleId in affectedArticleIds)
            await SearchIndexJobQueue.EnqueueArticleAsync(dbContext, articleId, SearchIndexJobTypes.Upsert,
                audit.CreatedAt, cancellationToken);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsSlugUniquenessViolation(exception))
        {
            throw new ConflictException("The category slug is already in use.");
        }
        return Map(entity);
    }

    public async Task<CategoryData> MoveAndAuditAsync(IReadOnlyList<HierarchyUpdate> updates, AuditData audit,
        CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfZero(updates.Count);
        var ids = updates.Select(update => update.Id).ToArray();
        var entities = await dbContext.Categories.Where(category => ids.Contains(category.CategoryId))
            .ToDictionaryAsync(category => category.CategoryId, cancellationToken);
        if (entities.Count != updates.Count)
            throw new ConflictException("The category hierarchy changed while the move was being prepared.");
        foreach (var update in updates)
        {
            var entity = entities[update.Id];
            entity.ParentCategoryIdFk = update.ParentCategoryId;
            entity.Path = update.Path;
            entity.Depth = update.Depth;
            entity.SortOrder = update.SortOrder;
        }
        AddAudit(updates[0].Id, audit);
        foreach (var update in updates)
            await SearchIndexJobQueue.EnqueueCategoryAsync(dbContext, update.Id, SearchIndexJobTypes.Upsert,
                audit.CreatedAt, cancellationToken);
        var articleIds = await dbContext.Articles.AsNoTracking()
            .Where(article => (article.CategoryIdFk.HasValue && ids.Contains(article.CategoryIdFk.Value) ||
                               article.ArticleCategories.Any(link => ids.Contains(link.CategoryIdFk))) &&
                              article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)
            .Select(article => article.ArticleId).ToListAsync(cancellationToken);
        foreach (var articleId in articleIds)
            await SearchIndexJobQueue.EnqueueArticleAsync(dbContext, articleId, SearchIndexJobTypes.Upsert,
                audit.CreatedAt, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(entities[updates[0].Id]);
    }

    public async Task DeleteAndAuditAsync(Guid id, AuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.SingleAsync(category => category.CategoryId == id, cancellationToken);
        AddAudit(id, audit);
        await SearchIndexJobQueue.EnqueueCategoryAsync(dbContext, id, SearchIndexJobTypes.Delete, audit.CreatedAt, cancellationToken);
        dbContext.Categories.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<CategoryData> SetStatusAndAuditAsync(Guid id, string status, AuditData audit,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.SingleAsync(category => category.CategoryId == id, cancellationToken);
        entity.Status = status;
        AddAudit(id, audit);
        var affectedIds = string.IsNullOrWhiteSpace(entity.Path) ? [id] : await dbContext.Categories.AsNoTracking()
            .Where(category => category.Path != null && category.Path.StartsWith(entity.Path))
            .Select(category => category.CategoryId).ToArrayAsync(cancellationToken);
        foreach (var affectedId in affectedIds)
            await SearchIndexJobQueue.EnqueueCategoryAsync(dbContext, affectedId, SearchIndexJobTypes.Upsert,
                audit.CreatedAt, cancellationToken);
        var articleIds = await dbContext.Articles.AsNoTracking()
            .Where(article => (article.CategoryIdFk.HasValue && affectedIds.Contains(article.CategoryIdFk.Value) ||
                               article.ArticleCategories.Any(link => affectedIds.Contains(link.CategoryIdFk))) &&
                              article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)
            .Select(article => article.ArticleId).ToArrayAsync(cancellationToken);
        foreach (var articleId in articleIds)
            await SearchIndexJobQueue.EnqueueArticleAsync(dbContext, articleId, SearchIndexJobTypes.Upsert,
                audit.CreatedAt, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(entity);
    }

    public async Task<CategoryData> SetLocalizationsAndAuditAsync(Guid id,
        IReadOnlyList<CategoryLocalizationWrite> localizations, AuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.Include(category => category.CategoryLocalizations)
            .SingleAsync(category => category.CategoryId == id, cancellationToken);
        var enabledLanguages = await dbContext.KbLanguages.AsNoTracking().Where(language => language.IsEnabled)
            .ToDictionaryAsync(language => language.LocaleCode, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var defaultLanguage = enabledLanguages.Values.SingleOrDefault(language => language.IsDefault);
        foreach (var localization in localizations)
        {
            if (!enabledLanguages.TryGetValue(localization.LocaleCode, out var language))
                throw new BusinessRuleException($"Language '{localization.LocaleCode}' is not enabled.");
            var existing = entity.CategoryLocalizations.SingleOrDefault(item =>
                string.Equals(item.LocaleCode, language.LocaleCode, StringComparison.OrdinalIgnoreCase));
            if (string.IsNullOrWhiteSpace(localization.Name))
            {
                if (language.IsDefault)
                {
                    if (existing is null)
                        entity.CategoryLocalizations.Add(new CategoryLocalization
                        {
                            CategoryId = entity.CategoryId, LocaleCode = language.LocaleCode, Name = entity.Name,
                            Description = entity.Description
                        });
                    else
                    {
                        existing.Name = entity.Name;
                        existing.Description = entity.Description;
                    }
                }
                else if (existing is not null)
                    dbContext.CategoryLocalizations.Remove(existing);
                continue;
            }
            if (existing is null)
                entity.CategoryLocalizations.Add(new CategoryLocalization
                {
                    CategoryId = entity.CategoryId, LocaleCode = language.LocaleCode, Name = localization.Name,
                    Description = localization.Description
                });
            else
            {
                existing.Name = localization.Name;
                existing.Description = localization.Description;
            }
        }
        if (defaultLanguage is not null && !entity.CategoryLocalizations.Any(item =>
                string.Equals(item.LocaleCode, defaultLanguage.LocaleCode, StringComparison.OrdinalIgnoreCase)))
            entity.CategoryLocalizations.Add(new CategoryLocalization
            {
                CategoryId = entity.CategoryId, LocaleCode = defaultLanguage.LocaleCode, Name = entity.Name,
                Description = entity.Description
            });
        AddAudit(id, audit);
        await EnqueueAffectedContentAsync(entity.Path, id, audit.CreatedAt, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(entity);
    }

    private async Task EnqueueAffectedContentAsync(string? path, Guid id, DateTime createdAt,
        CancellationToken cancellationToken)
    {
        var affectedIds = string.IsNullOrWhiteSpace(path) ? [id] : await dbContext.Categories.AsNoTracking()
            .Where(category => category.Path != null && category.Path.StartsWith(path))
            .Select(category => category.CategoryId).ToArrayAsync(cancellationToken);
        foreach (var affectedId in affectedIds)
            await SearchIndexJobQueue.EnqueueCategoryAsync(dbContext, affectedId, SearchIndexJobTypes.Upsert,
                createdAt, cancellationToken);
        var articleIds = await dbContext.Articles.AsNoTracking()
            .Where(article => (article.CategoryIdFk.HasValue && affectedIds.Contains(article.CategoryIdFk.Value) ||
                               article.ArticleCategories.Any(link => affectedIds.Contains(link.CategoryIdFk))) &&
                              article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)
            .Select(article => article.ArticleId).ToArrayAsync(cancellationToken);
        foreach (var articleId in articleIds)
            await SearchIndexJobQueue.EnqueueArticleAsync(dbContext, articleId, SearchIndexJobTypes.Upsert,
                createdAt, cancellationToken);
    }

    private void AddAudit(Guid categoryId, AuditData audit) => dbContext.ArticleAuditLogs.Add(new()
    {
        AuditLogId = dbContext.Database.IsSqlServer() ? Guid.Empty : Guid.NewGuid(),
        ArticleIdFk = null,
        ActorIdFk = audit.ActorId,
        ActionType = audit.Action,
        EntityType = AuditEntityTypes.Category,
        EntityId = categoryId,
        MetaDataJson = audit.MetadataJson,
        CreatedAt = audit.CreatedAt
    });

    private static CategoryData Map(Category category) => new(category.CategoryId, category.ParentCategoryIdFk,
        category.Name, category.Slug, category.Description, category.SortOrder, category.Path, category.Depth,
        Status: category.Status, Visibility: category.Visibility, ViewerImageMediaId: category.ViewerImageMediaIdFk,
        ViewerIcon: category.ViewerIcon, Localizations: category.CategoryLocalizations
            .OrderBy(localization => localization.LocaleCode)
            .Select(localization => new CategoryLocalizationData(localization.LocaleCode, localization.Name,
                localization.Description)).ToArray());

    private static bool IsSlugUniquenessViolation(DbUpdateException exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current.Message.Contains("UX_CATEGORIES_Slug", StringComparison.OrdinalIgnoreCase) ||
                (current.Message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase) &&
                 current.Message.Contains("CATEGORIES.Slug", StringComparison.OrdinalIgnoreCase)))
                return true;
        return false;
    }
}
