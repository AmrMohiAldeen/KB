namespace Kb.Application.Audit;

public interface IAuditLogRepository
{
    Task<PagedAuditLogRecordData> GetPagedAsync(AuditLogQuery query, CancellationToken cancellationToken);
}
