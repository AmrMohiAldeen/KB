using Kb.Application.Audit;
using Kb.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Audit;

public sealed class AuditLogRepository(KbDbContext dbContext) : IAuditLogRepository
{
    public async Task<PagedAuditLogRecordData> GetPagedAsync(
        AuditLogQuery query,
        CancellationToken cancellationToken)
    {
        var source = dbContext.ArticleAuditLogs.AsNoTracking().AsQueryable();

        if (query.ArticleId is { } articleId)
            source = source.Where(log => log.ArticleIdFk == articleId);
        if (query.UserId is { } userId)
            source = source.Where(log => log.ActorIdFk == userId);
        if (query.Article is not null)
            source = source.Where(log =>
                log.ArticleIdFkNavigation != null &&
                (log.ArticleIdFkNavigation.Title.Contains(query.Article) ||
                 log.ArticleIdFkNavigation.Slug.Contains(query.Article)));
        if (query.User is not null)
            source = source.Where(log =>
                (log.ActorIdFkNavigation != null &&
                (log.ActorIdFkNavigation.FullName.Contains(query.User) ||
                 log.ActorIdFkNavigation.Email.Contains(query.User))) ||
                log.ExternalActorId != null && (log.ExternalActorId.Contains(query.User) ||
                    log.ExternalActorEmail != null && log.ExternalActorEmail.Contains(query.User)));
        if (query.ActionType is not null)
            source = source.Where(log => log.ActionType == query.ActionType);
        if (query.From is { } from)
            source = source.Where(log => log.CreatedAt >= from);
        if (query.To is { } to)
            source = source.Where(log => log.CreatedAt <= to);

        var totalCount = await source.LongCountAsync(cancellationToken);
        var ordered = query.Descending
            ? source.OrderByDescending(log => log.CreatedAt).ThenByDescending(log => log.AuditLogId)
            : source.OrderBy(log => log.CreatedAt).ThenBy(log => log.AuditLogId);
        var skip = (int)Math.Min((long)(query.Page - 1) * query.PageSize, int.MaxValue);
        var items = await ordered
            .Skip(skip)
            .Take(query.PageSize)
            .Select(log => new AuditLogRecordData(
                log.AuditLogId,
                log.ArticleIdFk,
                log.ArticleIdFkNavigation == null
                    ? null
                    : new AuditArticleData(
                        log.ArticleIdFkNavigation.ArticleId,
                        log.ArticleIdFkNavigation.Title,
                        log.ArticleIdFkNavigation.Slug,
                        log.ArticleIdFkNavigation.LocaleCode),
                log.ActorIdFkNavigation == null
                    ? null
                    : new AuditUserData(
                        log.ActorIdFkNavigation.UserId,
                        log.ActorIdFkNavigation.FullName),
                log.ExternalActorId == null ? null : new AuditExternalActorData(log.ExternalActorId,
                    log.ExternalActorEmail, log.ViewerCustomerId, log.ViewerSessionId, log.ViewerSolutionId),
                log.ActionType,
                log.EntityType,
                log.EntityId,
                log.MetaDataJson,
                log.CreatedAt))
            .ToListAsync(cancellationToken);

        return new(items, query.Page, query.PageSize, totalCount);
    }
}
