namespace Kb.Application.Categories;

public interface ICategoryRepository
{
    Task<T> ExecuteSerializableAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken);
    Task<CategoryData?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<CategoryData>> GetAllAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<CategoryData>> GetDescendantsAsync(string pathPrefix, Guid categoryId, CancellationToken cancellationToken);
    Task<bool> SlugExistsAsync(string slug, Guid? excludingId, CancellationToken cancellationToken);
    Task<bool> HasChildrenAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> HasArticlesAsync(Guid id, CancellationToken cancellationToken);
    Task<CategoryData> InsertAsync(NewCategoryData category, CancellationToken cancellationToken);
    Task<CategoryData> SetPathAndAuditAsync(Guid id, string path, int depth, AuditData audit, CancellationToken cancellationToken);
    Task<CategoryData> UpdateAndAuditAsync(Guid id, string name, string slug, string? description, int sortOrder, AuditData audit, CancellationToken cancellationToken);
    Task<CategoryData> MoveAndAuditAsync(IReadOnlyList<HierarchyUpdate> updates, AuditData audit, CancellationToken cancellationToken);
    Task DeleteAndAuditAsync(Guid id, AuditData audit, CancellationToken cancellationToken);
    Task<CategoryData> SetStatusAndAuditAsync(Guid id, string status, AuditData audit, CancellationToken cancellationToken);
}
