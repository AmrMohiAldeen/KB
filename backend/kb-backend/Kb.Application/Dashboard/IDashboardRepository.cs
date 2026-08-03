namespace Kb.Application.Dashboard;

public interface IDashboardRepository
{
    Task<bool> CategoryExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<DashboardPageData> GetAsync(DashboardQuery query, CancellationToken cancellationToken);
}
