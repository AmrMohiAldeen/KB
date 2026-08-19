using System.Data;
using System.Text.Json;
using Kb.Application.Exceptions;
using Kb.Application.Viewer;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Viewer;

public sealed class ViewerRepository(KbDbContext db, TimeProvider timeProvider) : IViewerRepository
{
    public async Task<ViewerSessionData> CreateSessionAsync(ViewerHandoffIdentity handoff, DateTime expiresAt,
        CancellationToken token)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, token);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        if (await db.ViewerSessions.AnyAsync(item => item.HandoffId == handoff.HandoffId, token))
            throw new ConflictException("The viewer handoff has already been used.");
        var customer = await db.ViewerCustomers.SingleOrDefaultAsync(item =>
            item.ExternalCustomerId == handoff.ExternalCustomerId && item.IsEnabled, token)
            ?? throw new ForbiddenException("The viewer customer is disabled or is not registered.");
        var requested = handoff.SolutionSlugs.Select(item => item.Trim().ToLowerInvariant())
            .Distinct(StringComparer.Ordinal).ToArray();
        var solutions = await db.ViewerEntitlements.Where(item => item.CustomerIdFk == customer.CustomerId &&
                item.Solution.IsEnabled && requested.Contains(item.Solution.Slug))
            .Select(item => new ViewerSolutionReference(item.SolutionIdFk, item.Solution.Slug)).ToListAsync(token);
        if (solutions.Count != requested.Length)
            throw new ForbiddenException("The handoff requested a solution that the customer is not entitled to use.");
        var activeCount = await db.ViewerSessions.CountAsync(item => item.CustomerIdFk == customer.CustomerId &&
            item.RevokedAt == null && item.ExpiresAt > now, token);
        if (activeCount >= customer.MaxConcurrentSessions)
            throw new ConflictException("The customer concurrent Viewer session limit has been reached.");

        var sessionId = Guid.NewGuid();
        var session = new ViewerSession
        {
            SessionId = sessionId, CustomerIdFk = customer.CustomerId,
            ExternalUserId = handoff.ExternalUserId.Trim(), ExternalUserEmail = handoff.ExternalUserEmail.Trim(),
            HandoffId = handoff.HandoffId, CreatedAt = now, LastSeenAt = now, ExpiresAt = expiresAt,
            Solutions = solutions.Select(solution => new ViewerSessionSolution
                { SessionIdFk = sessionId, SolutionIdFk = solution.SolutionId }).ToList()
        };
        db.ViewerSessions.Add(session);
        db.ArticleAuditLogs.Add(ViewerAudit("ViewerSessionCreated", handoff.ExternalUserId,
            handoff.ExternalUserEmail, customer.CustomerId, sessionId, null, null,
            new { solutionIds = solutions.Select(item => item.SolutionId), handoff.IpAddress, handoff.UserAgent }));
        try
        {
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
        }
        catch (DbUpdateException)
        {
            throw new ConflictException("The viewer handoff was replayed or the session limit changed.");
        }
        return new(sessionId, customer.CustomerId, session.ExternalUserId, session.ExternalUserEmail, expiresAt, solutions);
    }

    public async Task<ViewerSessionValidation> ValidateSessionAsync(Guid sessionId, DateTime now, CancellationToken token)
    {
        var session = await db.ViewerSessions.AsNoTracking().Where(item => item.SessionId == sessionId &&
                item.RevokedAt == null && item.ExpiresAt > now && item.Customer.IsEnabled)
            .Select(item => new
            {
                item.SessionId, item.CustomerIdFk, item.ExternalUserId, item.ExternalUserEmail, item.ExpiresAt,
                Solutions = item.Solutions.Where(link => link.Solution.IsEnabled &&
                        link.Solution.Entitlements.Any(entitlement => entitlement.CustomerIdFk == item.CustomerIdFk))
                    .Select(link => new ViewerSolutionReference(link.SolutionIdFk, link.Solution.Slug)).ToList()
            }).SingleOrDefaultAsync(token);
        if (session is null || session.Solutions.Count == 0) return new(false, null);
        if (await db.ViewerSessions.Where(item => item.SessionId == sessionId && item.LastSeenAt < now.AddMinutes(-1))
            .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.LastSeenAt, now), token) > 0)
            db.ChangeTracker.Clear();
        return new(true, new(session.SessionId, session.CustomerIdFk, session.ExternalUserId,
            session.ExternalUserEmail, session.ExpiresAt, session.Solutions));
    }

    public async Task RevokeSessionAsync(Guid sessionId, DateTime now, string reason, CancellationToken token)
    {
        var session = await db.ViewerSessions.SingleOrDefaultAsync(item => item.SessionId == sessionId, token);
        if (session is null || session.RevokedAt is not null) return;
        session.RevokedAt = now;
        session.RevokedReason = reason;
        db.ArticleAuditLogs.Add(ViewerAudit("ViewerSessionRevoked", session.ExternalUserId,
            session.ExternalUserEmail, session.CustomerIdFk, session.SessionId, null, null, new { reason }));
        await db.SaveChangesAsync(token);
    }

    public async Task<ViewerPortalData> GetPortalAsync(Guid sessionId, string solutionSlug, CancellationToken token)
    {
        var solution = await ResolveAuthorizedSolutionAsync(sessionId, solutionSlug, token);
        return new(solution.SolutionId, solution.Slug, solution.RootCategory.Name, solution.RootCategory.Description);
    }

    public async Task<IReadOnlyList<ViewerCategoryData>> GetCategoriesAsync(Guid sessionId, string solutionSlug,
        CancellationToken token)
    {
        var solution = await ResolveAuthorizedSolutionAsync(sessionId, solutionSlug, token);
        return await GetCategoriesForRootAsync(RequiredRootPath(solution), token);
    }

    public async Task<IReadOnlyList<ViewerArticleSummary>> GetArticlesAsync(Guid sessionId, string solutionSlug,
        string? search, Guid? categoryId, CancellationToken token)
    {
        var solution = await ResolveAuthorizedSolutionAsync(sessionId, solutionSlug, token);
        return await GetArticlesForRootAsync(RequiredRootPath(solution), search, categoryId, token);
    }

    public async Task<ViewerArticleSource?> GetArticleAsync(Guid sessionId, string solutionSlug, string slug,
        Guid? articleId, CancellationToken token)
    {
        var solution = await ResolveAuthorizedSolutionAsync(sessionId, solutionSlug, token);
        return await GetArticleForRootAsync(RequiredRootPath(solution), slug, articleId, solution.SolutionId, token);
    }

    public async Task<ViewerPortalData> GetPreviewPortalAsync(Guid rootCategoryId, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategoryId, token);
        return new(root.CategoryId, root.Slug, root.Name, root.Description);
    }

    public async Task<IReadOnlyList<ViewerCategoryData>> GetPreviewCategoriesAsync(Guid rootCategoryId,
        CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategoryId, token);
        return await GetCategoriesForRootAsync(root.Path!, token);
    }

    public async Task<IReadOnlyList<ViewerArticleSummary>> GetPreviewArticlesAsync(Guid rootCategoryId,
        string? search, Guid? categoryId, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategoryId, token);
        return await GetArticlesForRootAsync(root.Path!, search, categoryId, token);
    }

    public async Task<ViewerArticleSource?> GetPreviewArticleAsync(Guid rootCategoryId, string slug,
        Guid? articleId, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategoryId, token);
        return await GetArticleForRootAsync(root.Path!, slug, articleId, null, token);
    }

    public async Task RecordArticleViewAsync(ICurrentViewer viewer, ViewerArticleSource article, string? ipAddress,
        string? userAgent, CancellationToken token)
    {
        db.ArticleAuditLogs.Add(ViewerAudit("ViewerArticleViewed", viewer.ExternalUserId,
            viewer.ExternalUserEmail, viewer.CustomerId, viewer.SessionId, article.SolutionId, article.Id,
            new { ipAddress, userAgent }));
        await db.SaveChangesAsync(token);
    }

    private async Task<ViewerSolution> ResolveAuthorizedSolutionAsync(Guid sessionId, string slug,
        CancellationToken token)
    {
        var solution = await db.ViewerSolutions.AsNoTracking().Include(item => item.RootCategory)
            .SingleOrDefaultAsync(item => item.Slug == slug && item.IsEnabled, token)
            ?? throw new NotFoundException("The Viewer solution was not found.");
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var authorized = await db.ViewerSessionSolutions.AsNoTracking().AnyAsync(link =>
            link.SessionIdFk == sessionId && link.SolutionIdFk == solution.SolutionId &&
            link.Session.RevokedAt == null && link.Session.ExpiresAt > now && link.Session.Customer.IsEnabled &&
            link.Solution.IsEnabled && link.Solution.Entitlements.Any(entitlement =>
                entitlement.CustomerIdFk == link.Session.CustomerIdFk), token);
        if (!authorized)
        {
            var session = await db.ViewerSessions.AsNoTracking().Where(item => item.SessionId == sessionId)
                .Select(item => new { item.ExternalUserId, item.ExternalUserEmail, item.CustomerIdFk })
                .SingleOrDefaultAsync(token);
            if (session is not null)
            {
                db.ArticleAuditLogs.Add(ViewerAudit("ViewerEntitlementDenied", session.ExternalUserId,
                    session.ExternalUserEmail, session.CustomerIdFk, sessionId, solution.SolutionId, null,
                    new { requestedSlug = slug }));
                await db.SaveChangesAsync(token);
            }
            throw new ForbiddenException("The Viewer session is not entitled to this solution.");
        }
        return solution;
    }

    private async Task<Category> ResolvePreviewRootAsync(Guid rootCategoryId, CancellationToken token)
    {
        var root = await db.Categories.AsNoTracking().SingleOrDefaultAsync(category =>
            category.CategoryId == rootCategoryId && category.Path != null, token)
            ?? throw new NotFoundException("The preview category was not found.");
        if (!await VisibleCategories(root.Path!).AnyAsync(category => category.CategoryId == rootCategoryId, token))
            throw new NotFoundException("The preview category is not Viewer-visible.");
        return root;
    }

    private Task<List<ViewerCategoryData>> GetCategoriesForRootAsync(string rootPath, CancellationToken token) =>
        VisibleCategories(rootPath).OrderBy(item => item.Depth).ThenBy(item => item.SortOrder)
            .ThenBy(item => item.Name).Select(category => new ViewerCategoryData(category.CategoryId,
                category.ParentCategoryIdFk, category.Name, category.Slug, category.Description, category.SortOrder,
                category.Path, category.Depth, category.Articles.Count(article =>
                    article.Visibility == ContentVisibilities.Public && article.Status == ArticleStatuses.Published &&
                    article.DeletedAt == null && article.LastPublishedVersionIdFk != null)))
            .ToListAsync(token);

    private async Task<IReadOnlyList<ViewerArticleSummary>> GetArticlesForRootAsync(string rootPath, string? search,
        Guid? categoryId, CancellationToken token)
    {
        var query = VisibleArticles(rootPath);
        if (search is not null) query = query.Where(article => article.Title.Contains(search));
        if (categoryId is { } id) query = query.Where(article => article.CategoryIdFk == id);
        return await query.OrderBy(article => article.Position).ThenBy(article => article.Title)
            .Select(article => new ViewerArticleSummary(article.ArticleId, article.Title, article.Slug,
                article.CategoryIdFk!.Value, article.CategoryIdFkNavigation!.Name,
                article.CategoryIdFkNavigation.Path ?? article.CategoryIdFkNavigation.Name, article.UpdatedAt))
            .ToListAsync(token);
    }

    private Task<ViewerArticleSource?> GetArticleForRootAsync(string rootPath, string slug, Guid? articleId,
        Guid? solutionId, CancellationToken token)
    {
        var query = VisibleArticles(rootPath);
        query = articleId is { } id ? query.Where(article => article.ArticleId == id) :
            query.Where(article => article.Slug == slug);
        return query.Select(article => new ViewerArticleSource(article.ArticleId, article.Title, article.Slug,
            article.CategoryIdFk!.Value, article.CategoryIdFkNavigation!.Name,
            article.CategoryIdFkNavigation.Path ?? article.CategoryIdFkNavigation.Name, article.UpdatedAt,
            article.LastPublishedVersionIdFkNavigation!.ContentJsonStoragePath, solutionId))
            .SingleOrDefaultAsync(token);
    }

    private IQueryable<Category> VisibleCategories(string rootPath) => db.Categories.AsNoTracking().Where(category =>
        category.Path != null && category.Path.StartsWith(rootPath) && category.Status == CategoryStatuses.Active &&
        category.Visibility == ContentVisibilities.Public && !db.Categories.Any(ancestor => ancestor.Path != null &&
            category.Path.StartsWith(ancestor.Path) && (ancestor.Status != CategoryStatuses.Active ||
                ancestor.Visibility != ContentVisibilities.Public)));

    private IQueryable<Article> VisibleArticles(string rootPath) => db.Articles.AsNoTracking().Where(article =>
        article.Visibility == ContentVisibilities.Public && article.Status == ArticleStatuses.Published &&
        article.DeletedAt == null && article.LastPublishedVersionIdFk != null && article.CategoryIdFk != null &&
        article.CategoryIdFkNavigation != null && article.CategoryIdFkNavigation.Path != null &&
        article.CategoryIdFkNavigation.Path.StartsWith(rootPath) &&
        article.CategoryIdFkNavigation.Status == CategoryStatuses.Active &&
        article.CategoryIdFkNavigation.Visibility == ContentVisibilities.Public &&
        !db.Categories.Any(ancestor => ancestor.Path != null &&
            article.CategoryIdFkNavigation.Path.StartsWith(ancestor.Path) &&
            (ancestor.Status != CategoryStatuses.Active || ancestor.Visibility != ContentVisibilities.Public)));

    private static string RequiredRootPath(ViewerSolution solution) => solution.RootCategory.Path ??
        throw new ConflictException("The Viewer solution root category has no hierarchy path.");

    private static ArticleAuditLog ViewerAudit(string action, string externalId, string email, Guid customerId,
        Guid sessionId, Guid? solutionId, Guid? articleId, object metadata) => new()
    {
        AuditLogId = Guid.NewGuid(), ActionType = action, EntityType = "Viewer", EntityId = sessionId,
        ArticleIdFk = articleId, ExternalActorId = externalId, ExternalActorEmail = email,
        ViewerCustomerId = customerId, ViewerSessionId = sessionId, ViewerSolutionId = solutionId,
        MetaDataJson = JsonSerializer.Serialize(metadata), CreatedAt = DateTime.UtcNow
    };
}
