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
        return new(solution.SolutionId, solution.Slug, solution.RootCategory.Name, solution.RootCategory.Description,
            (await GetDashboardCustomizationAsync(solution.RootCategoryIdFk, token)).Appearance);
    }

    public async Task<ViewerDashboardAppearanceData> GetAppearanceAsync(CancellationToken token)
    {
        var settings = await db.ViewerDashboardSettings.AsNoTracking()
            .SingleOrDefaultAsync(item => item.SettingsId == 1, token);
        return settings is null ? ViewerDashboardAppearanceData.Default : new(settings.PrimaryColor,
            settings.PageBackgroundColor, settings.CategoryCardBackgroundColor, settings.TextColor);
    }

    public async Task<ViewerDashboardAppearanceData> SaveAppearanceAsync(ViewerDashboardAppearanceData appearance,
        DateTime updatedAt, CancellationToken token)
    {
        var settings = await db.ViewerDashboardSettings.SingleOrDefaultAsync(item => item.SettingsId == 1, token);
        if (settings is null)
        {
            settings = new ViewerDashboardSettings { SettingsId = 1 };
            db.ViewerDashboardSettings.Add(settings);
        }
        settings.PrimaryColor = appearance.PrimaryColor;
        settings.PageBackgroundColor = appearance.PageBackgroundColor;
        settings.CategoryCardBackgroundColor = appearance.CategoryCardBackgroundColor;
        settings.TextColor = appearance.TextColor;
        settings.UpdatedAt = updatedAt;
        await db.SaveChangesAsync(token);
        return appearance;
    }

    public async Task<ViewerDashboardCustomizationData> GetDashboardCustomizationAsync(Guid rootCategoryId,
        CancellationToken token)
    {
        var customization = await db.ViewerDashboardCustomizations.AsNoTracking()
            .Include(item => item.Categories).SingleOrDefaultAsync(item => item.RootCategoryId == rootCategoryId, token);
        var appearance = customization is null ? await GetAppearanceAsync(token) : new ViewerDashboardAppearanceData(
            customization.PrimaryColor, customization.PageBackgroundColor, customization.CategoryCardBackgroundColor,
            customization.TextColor);
        return new ViewerDashboardCustomizationData(rootCategoryId, appearance, customization?.Categories.Select(item =>
            new ViewerDashboardCategoryCustomizationData(item.CategoryId, item.SortOrder, item.ViewerImageMediaId,
                item.ViewerIcon, item.DisplayColor)).ToArray() ?? []);
    }

    public async Task<ViewerDashboardCustomizationData> SaveDashboardCustomizationAsync(
        ViewerDashboardCustomizationData customization, DateTime updatedAt, CancellationToken token)
    {
        if (!await db.Categories.AsNoTracking().AnyAsync(item => item.CategoryId == customization.RootCategoryId, token))
            throw new BusinessRuleException("The dashboard root category was not found.");
        var childIds = customization.Categories.Select(item => item.CategoryId).ToHashSet();
        var validChildIds = await db.Categories.AsNoTracking().Where(category =>
                childIds.Contains(category.CategoryId) && category.ParentCategoryIdFk == customization.RootCategoryId)
            .Select(category => category.CategoryId).ToHashSetAsync(token);
        if (childIds.Count != customization.Categories.Count || !validChildIds.SetEquals(childIds))
            throw new BusinessRuleException("Dashboard customizations may only target direct child categories.");

        var entity = await db.ViewerDashboardCustomizations.Include(item => item.Categories)
            .SingleOrDefaultAsync(item => item.RootCategoryId == customization.RootCategoryId, token);
        if (entity is null)
        {
            entity = new ViewerDashboardCustomization { RootCategoryId = customization.RootCategoryId };
            db.ViewerDashboardCustomizations.Add(entity);
        }
        entity.PrimaryColor = customization.Appearance.PrimaryColor;
        entity.PageBackgroundColor = customization.Appearance.PageBackgroundColor;
        entity.CategoryCardBackgroundColor = customization.Appearance.CategoryCardBackgroundColor;
        entity.TextColor = customization.Appearance.TextColor;
        entity.UpdatedAt = updatedAt;
        db.ViewerDashboardCategoryCustomizations.RemoveRange(entity.Categories);
        entity.Categories = customization.Categories.Select(item => new ViewerDashboardCategoryCustomization
        {
            RootCategoryId = customization.RootCategoryId, CategoryId = item.CategoryId, SortOrder = item.SortOrder,
            ViewerImageMediaId = item.ViewerImageMediaId, ViewerIcon = item.ViewerIcon, DisplayColor = item.DisplayColor
        }).ToList();
        await db.SaveChangesAsync(token);
        return customization;
    }

    public async Task<IReadOnlyList<ViewerCategoryData>> GetCategoriesAsync(Guid sessionId, string solutionSlug,
        CancellationToken token)
    {
        var solution = await ResolveAuthorizedSolutionAsync(sessionId, solutionSlug, token);
        return await GetCategoriesForRootAsync(solution.RootCategoryIdFk, RequiredRootPath(solution), token);
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

    public async Task<ViewerCategoryImageSource?> GetCategoryImageAsync(Guid sessionId, string solutionSlug,
        Guid categoryId, CancellationToken token)
    {
        var solution = await ResolveAuthorizedSolutionAsync(sessionId, solutionSlug, token);
        return await GetCategoryImageForRootAsync(solution.RootCategoryIdFk, RequiredRootPath(solution), categoryId, token);
    }

    public async Task<ViewerPortalData> GetPreviewPortalAsync(string rootCategorySlug, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategorySlug, token);
        return new(root.CategoryId, root.Slug, root.Name, root.Description,
            (await GetDashboardCustomizationAsync(root.CategoryId, token)).Appearance);
    }

    public async Task<IReadOnlyList<ViewerCategoryData>> GetPreviewCategoriesAsync(string rootCategorySlug,
        CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategorySlug, token);
        return await GetCategoriesForRootAsync(root.CategoryId, root.Path!, token);
    }

    public async Task<IReadOnlyList<ViewerArticleSummary>> GetPreviewArticlesAsync(string rootCategorySlug,
        string? search, Guid? categoryId, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategorySlug, token);
        return await GetArticlesForRootAsync(root.Path!, search, categoryId, token);
    }

    public async Task<ViewerArticleSource?> GetPreviewArticleAsync(string rootCategorySlug, string slug,
        Guid? articleId, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategorySlug, token);
        return await GetArticleForRootAsync(root.Path!, slug, articleId, null, token);
    }

    public async Task<ViewerCategoryImageSource?> GetPreviewCategoryImageAsync(string rootCategorySlug,
        Guid categoryId, CancellationToken token)
    {
        var root = await ResolvePreviewRootAsync(rootCategorySlug, token);
        return await GetCategoryImageForRootAsync(root.CategoryId, root.Path!, categoryId, token);
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

    private async Task<Category> ResolvePreviewRootAsync(string rootCategorySlug, CancellationToken token)
    {
        var root = await db.Categories.AsNoTracking().SingleOrDefaultAsync(category =>
            category.Slug == rootCategorySlug && category.Path != null, token)
            ?? throw new NotFoundException("The preview category was not found.");
        if (!await VisibleCategories(root.Path!).AnyAsync(category => category.CategoryId == root.CategoryId, token))
            throw new NotFoundException("The preview category is not Viewer-visible.");
        return root;
    }

    private async Task<List<ViewerCategoryData>> GetCategoriesForRootAsync(Guid rootCategoryId, string rootPath,
        CancellationToken token)
    {
        var categories = await VisibleCategories(rootPath).OrderBy(item => item.Depth).ThenBy(item => item.SortOrder)
            .ThenBy(item => item.Name).Select(category => new ViewerCategoryData(category.CategoryId,
                category.ParentCategoryIdFk, category.Name, category.Slug, category.Description, category.SortOrder,
                category.Path, category.Depth, category.ArticleCategories.Count(link =>
                    link.Article.Visibility == ContentVisibilities.Public && link.Article.Status == ArticleStatuses.Published &&
                    link.Article.DeletedAt == null && link.Article.LastPublishedVersionIdFk != null) +
                category.Articles.Count(article => !article.ArticleCategories.Any() &&
                    article.Visibility == ContentVisibilities.Public && article.Status == ArticleStatuses.Published &&
                    article.DeletedAt == null && article.LastPublishedVersionIdFk != null),
                category.ViewerImageMediaIdFkNavigation != null &&
                    category.ViewerImageMediaIdFkNavigation.Status == MediaStatuses.Active &&
                    category.ViewerImageMediaIdFkNavigation.MimeType.StartsWith("image/"), category.ViewerIcon))
            .ToListAsync(token);
        var customizations = await db.ViewerDashboardCategoryCustomizations.AsNoTracking().Where(item =>
            item.RootCategoryId == rootCategoryId).ToDictionaryAsync(item => item.CategoryId, token);
        var imageIds = customizations.Values.Where(item => item.ViewerImageMediaId.HasValue)
            .Select(item => item.ViewerImageMediaId!.Value).ToHashSet();
        var activeImageIds = await db.MediaFiles.AsNoTracking().Where(item => imageIds.Contains(item.MediaId) &&
            item.Status == MediaStatuses.Active && item.MimeType.StartsWith("image/")).Select(item => item.MediaId)
            .ToHashSetAsync(token);
        return categories.Select(item => customizations.TryGetValue(item.Id, out var custom) && item.ParentId == rootCategoryId
            ? item with { SortOrder = custom.SortOrder, HasViewerImage = custom.ViewerImageMediaId.HasValue &&
                activeImageIds.Contains(custom.ViewerImageMediaId.Value), ViewerIcon = custom.ViewerIcon,
                DisplayColor = custom.DisplayColor } : item).ToList();
    }

    private async Task<ViewerCategoryImageSource?> GetCategoryImageForRootAsync(Guid rootCategoryId, string rootPath,
        Guid categoryId, CancellationToken token)
    {
        var customization = await db.ViewerDashboardCategoryCustomizations.AsNoTracking().SingleOrDefaultAsync(item =>
            item.RootCategoryId == rootCategoryId && item.CategoryId == categoryId, token);
        if (customization?.ViewerImageMediaId is { } mediaId)
            return await db.MediaFiles.AsNoTracking().Where(item => item.MediaId == mediaId &&
                item.Status == MediaStatuses.Active && item.MimeType.StartsWith("image/")).Select(item =>
                new ViewerCategoryImageSource(item.StoragePath, item.MimeType, item.OriginalFileName)).SingleOrDefaultAsync(token);
        return await VisibleCategories(rootPath).Where(category => category.CategoryId == categoryId &&
            category.ViewerImageMediaIdFkNavigation != null &&
            category.ViewerImageMediaIdFkNavigation.Status == MediaStatuses.Active &&
            category.ViewerImageMediaIdFkNavigation.MimeType.StartsWith("image/"))
        .Select(category => new ViewerCategoryImageSource(category.ViewerImageMediaIdFkNavigation!.StoragePath,
            category.ViewerImageMediaIdFkNavigation.MimeType,
            category.ViewerImageMediaIdFkNavigation.OriginalFileName)).SingleOrDefaultAsync(token);
    }

    private async Task<IReadOnlyList<ViewerArticleSummary>> GetArticlesForRootAsync(string rootPath, string? search,
        Guid? categoryId, CancellationToken token)
    {
        var query = VisibleArticles(rootPath);
        if (search is not null) query = query.Where(article => article.Title.Contains(search));
        if (categoryId is { } id) query = query.Where(article =>
            article.CategoryIdFk == id || article.ArticleCategories.Any(link => link.CategoryIdFk == id));
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
        article.CategoryIdFkNavigation != null &&
        (article.CategoryIdFkNavigation.Path != null && article.CategoryIdFkNavigation.Path.StartsWith(rootPath) &&
             article.CategoryIdFkNavigation.Status == CategoryStatuses.Active &&
             article.CategoryIdFkNavigation.Visibility == ContentVisibilities.Public &&
             !db.Categories.Any(ancestor => ancestor.Path != null &&
                 article.CategoryIdFkNavigation.Path.StartsWith(ancestor.Path) &&
                 (ancestor.Status != CategoryStatuses.Active || ancestor.Visibility != ContentVisibilities.Public)) ||
         article.ArticleCategories.Any(link => link.Category.Path != null && link.Category.Path.StartsWith(rootPath) &&
             link.Category.Status == CategoryStatuses.Active && link.Category.Visibility == ContentVisibilities.Public &&
             !db.Categories.Any(ancestor => ancestor.Path != null && link.Category.Path.StartsWith(ancestor.Path) &&
                 (ancestor.Status != CategoryStatuses.Active || ancestor.Visibility != ContentVisibilities.Public)))));

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
