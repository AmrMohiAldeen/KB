using System.Data;
using Kb.Application.Categories;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

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
                    article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)))
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
                    article.DeletedAt == null && article.Status != ArticleStatuses.Deleted)))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<CategoryData>> GetDescendantsAsync(string pathPrefix, Guid categoryId, CancellationToken cancellationToken) =>
        await dbContext.Categories.AsNoTracking()
            .Where(category => category.CategoryId != categoryId && category.Path != null && category.Path.StartsWith(pathPrefix))
            .Select(category => Map(category)).ToListAsync(cancellationToken);

    public Task<bool> SlugExistsAsync(string slug, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().AnyAsync(category => category.Slug == slug, cancellationToken);

    public Task<bool> HasChildrenAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Categories.AsNoTracking().AnyAsync(category => category.ParentCategoryIdFk == id, cancellationToken);

    public Task<bool> HasArticlesAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Articles.AsNoTracking().AnyAsync(article => article.CategoryIdFk == id, cancellationToken);

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
            Depth = category.Depth
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
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(entity);
    }

    public async Task<CategoryData> UpdateAndAuditAsync(Guid id, string name, string? description, int sortOrder,
        AuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.SingleAsync(category => category.CategoryId == id, cancellationToken);
        entity.Name = name;
        entity.Description = description;
        entity.SortOrder = sortOrder;
        AddAudit(id, audit);
        await dbContext.SaveChangesAsync(cancellationToken);
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
        await dbContext.SaveChangesAsync(cancellationToken);
        return Map(entities[updates[0].Id]);
    }

    public async Task DeleteAndAuditAsync(Guid id, AuditData audit, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Categories.SingleAsync(category => category.CategoryId == id, cancellationToken);
        AddAudit(id, audit);
        dbContext.Categories.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
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
        category.Name, category.Slug, category.Description, category.SortOrder, category.Path, category.Depth);

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
