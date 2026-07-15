namespace Kb.Application.Articles;

public interface IArticleRepository
{
    Task<T> ExecuteSerializableAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken);
    Task<PagedArticleData> GetPagedAsync(ArticleListQuery query, CancellationToken cancellationToken);
    Task<ArticleData?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<ArticleMutationData?> GetForMutationAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> CategoryExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> ActiveUserExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> SlugExistsAsync(string slug, Guid? excludingArticleId, CancellationToken cancellationToken);
    Task<ArticleData> InsertWithInitialDraftAndAuditAsync(NewArticleData article, ArticleAuditData audit,
        CancellationToken cancellationToken);
    Task<ArticleData> UpdateMetadataAndAuditAsync(Guid id, string title, string slug, Guid categoryId,
        byte[] rowVersion, ArticleAuditData audit, CancellationToken cancellationToken);
    Task SoftDeleteAndAuditAsync(Guid id, ArticleAuditData audit, CancellationToken cancellationToken);
}
