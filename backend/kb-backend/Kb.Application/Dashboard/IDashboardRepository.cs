namespace Kb.Application.Dashboard;

public interface IDashboardRepository
{
    Task<bool> CategoryExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<DashboardPageData> GetAsync(DashboardQuery query, CancellationToken cancellationToken);
    Task ReorderCategoryAsync(Guid id, Guid targetId, bool placeAfter, DashboardReorderAudit audit,
        CancellationToken cancellationToken);
    Task ReorderArticleAsync(Guid id, Guid targetId, bool placeAfter, DashboardReorderAudit audit,
        CancellationToken cancellationToken);
    Task MoveArticlesAsync(IReadOnlyCollection<Guid> articleIds, Guid destinationCategoryId,
        DashboardReorderAudit audit, CancellationToken cancellationToken);
}
