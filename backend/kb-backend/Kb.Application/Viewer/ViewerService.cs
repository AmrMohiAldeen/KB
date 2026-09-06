using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Microsoft.Extensions.Options;

namespace Kb.Application.Viewer;

public sealed class ViewerService(IViewerRepository repository, ICurrentViewer currentViewer,
    IObjectStorage storage, IOptions<ViewerAuthenticationOptions> options,
    TimeProvider timeProvider, ICurrentUser currentUser)
{
    public async Task<ViewerSessionData> ExchangeAsync(ViewerHandoffIdentity handoff, CancellationToken token)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        if (string.IsNullOrWhiteSpace(handoff.HandoffId) || handoff.HandoffId.Length > 256 ||
            string.IsNullOrWhiteSpace(handoff.ExternalUserId) || handoff.ExternalUserId.Length > 256 ||
            string.IsNullOrWhiteSpace(handoff.ExternalCustomerId) || handoff.ExternalCustomerId.Length > 256 ||
            string.IsNullOrWhiteSpace(handoff.ExternalUserEmail) || handoff.ExternalUserEmail.Length > 320 ||
            !new EmailAddressAttribute().IsValid(handoff.ExternalUserEmail))
            throw new UnauthorizedAccessException("The viewer handoff identity is invalid.");
        if (handoff.SolutionSlugs.Count == 0 || handoff.SolutionSlugs.Count > 50 ||
            handoff.SolutionSlugs.Any(slug => string.IsNullOrWhiteSpace(slug) || slug.Length > 100))
            throw new UnauthorizedAccessException("The viewer handoff has no valid solution entitlement.");
        if (handoff.IssuedAt > now.AddMinutes(1) || handoff.ExpiresAt <= now ||
            handoff.ExpiresAt - handoff.IssuedAt > options.Value.MaximumHandoffLifetime)
            throw new UnauthorizedAccessException("The viewer handoff has expired or has an invalid lifetime.");
        return await repository.CreateSessionAsync(handoff, now.Add(options.Value.SessionLifetime), token);
    }

    public Task<ViewerSessionValidation> ValidateSessionAsync(Guid sessionId, CancellationToken token) =>
        repository.ValidateSessionAsync(sessionId, timeProvider.GetUtcNow().UtcDateTime, token);

    public Task RevokeCurrentSessionAsync(CancellationToken token) => repository.RevokeSessionAsync(
        RequireViewer().SessionId, timeProvider.GetUtcNow().UtcDateTime, "Signed out", token);

    public Task<ViewerPortalData> GetPortalAsync(string solutionSlug, string? locale, CancellationToken token) =>
        repository.GetPortalAsync(RequireViewer().SessionId, NormalizeSlug(solutionSlug), NormalizeLocale(locale), token);

    public async Task<IReadOnlyList<ViewerCategoryNode>> GetTreeAsync(string solutionSlug, string? locale,
        CancellationToken token)
    {
        var categories = await repository.GetCategoriesAsync(RequireViewer().SessionId, NormalizeSlug(solutionSlug),
            NormalizeLocale(locale), token);
        return BuildTree(categories);
    }

    public Task<IReadOnlyList<ViewerArticleSummary>> GetArticlesAsync(string solutionSlug, string? locale, string? search,
        Guid? categoryId, CancellationToken token) => repository.GetArticlesAsync(RequireViewer().SessionId,
        NormalizeSlug(solutionSlug), NormalizeLocale(locale), string.IsNullOrWhiteSpace(search) ? null : search.Trim(),
        categoryId, token);

    public async Task<IReadOnlyList<ViewerArticleSummary>> SearchAsync(string solutionSlug, string? locale, string query,
        CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length > 200)
            throw new BusinessRuleException("A Viewer search query between 1 and 200 characters is required.");
        return await repository.GetArticlesAsync(RequireViewer().SessionId, NormalizeSlug(solutionSlug),
            NormalizeLocale(locale), query.Trim(), null, token);
    }

    public Task<ViewerArticle> GetArticleBySlugAsync(string solutionSlug, string articleSlug, string? locale, string? ip,
        string? userAgent, CancellationToken token) => GetArticleAsync(solutionSlug, articleSlug, null, locale, ip, userAgent, token);

    public Task<ViewerArticle> GetArticleByIdAsync(string solutionSlug, Guid articleId, string? locale, string? ip,
        string? userAgent, CancellationToken token) => GetArticleAsync(solutionSlug, null, articleId, locale, ip, userAgent, token);

    public async Task<ViewerCategoryImage> GetCategoryImageAsync(string solutionSlug, Guid categoryId,
        CancellationToken token)
    {
        var source = await repository.GetCategoryImageAsync(RequireViewer().SessionId,
            NormalizeSlug(solutionSlug), categoryId, token) ?? throw new NotFoundException("The category image was not found.");
        return await LoadCategoryImageAsync(source, token);
    }

    private async Task<ViewerArticle> GetArticleAsync(string solutionSlug, string? articleSlug, Guid? articleId,
        string? locale, string? ip, string? userAgent, CancellationToken token)
    {
        if (articleId == Guid.Empty || articleSlug is not null && string.IsNullOrWhiteSpace(articleSlug))
            throw new NotFoundException("The article was not found.");
        var viewer = RequireViewer();
        var source = await repository.GetArticleAsync(viewer.SessionId, NormalizeSlug(solutionSlug),
            NormalizeLocale(locale), articleSlug?.Trim() ?? string.Empty, articleId, token) ??
            throw new NotFoundException("The article was not found.");
        var article = await LoadArticleAsync(source, token);
        await repository.RecordArticleViewAsync(viewer, source, ip, userAgent, token);
        return article;
    }

    public Task<ViewerPortalData> GetPreviewPortalAsync(string rootCategorySlug, string? locale,
        CancellationToken token)
    {
        RequireInternalUser();
        return repository.GetPreviewPortalAsync(NormalizeSlug(rootCategorySlug), NormalizeLocale(locale), token);
    }

    public async Task<IReadOnlyList<ViewerCategoryNode>> GetPreviewTreeAsync(string rootCategorySlug, string? locale,
        CancellationToken token)
    {
        RequireInternalUser();
        return BuildTree(await repository.GetPreviewCategoriesAsync(NormalizeSlug(rootCategorySlug),
            NormalizeLocale(locale), token));
    }

    public Task<IReadOnlyList<ViewerArticleSummary>> GetPreviewArticlesAsync(string rootCategorySlug, string? locale,
        string? search, Guid? categoryId, CancellationToken token)
    {
        RequireInternalUser();
        return repository.GetPreviewArticlesAsync(NormalizeSlug(rootCategorySlug), NormalizeLocale(locale),
            string.IsNullOrWhiteSpace(search) ? null : search.Trim(), categoryId, token);
    }

    public async Task<IReadOnlyList<ViewerArticleSummary>> SearchPreviewAsync(string rootCategorySlug, string? locale,
        string query, CancellationToken token)
    {
        RequireInternalUser();
        ValidateSearch(query);
        return await repository.GetPreviewArticlesAsync(NormalizeSlug(rootCategorySlug), NormalizeLocale(locale),
            query.Trim(), null, token);
    }

    public Task<ViewerArticle> GetPreviewArticleBySlugAsync(string rootCategorySlug, string articleSlug, string? locale,
        CancellationToken token) => GetPreviewArticleAsync(rootCategorySlug, articleSlug, null, locale, token);

    public Task<ViewerArticle> GetPreviewArticleByIdAsync(string rootCategorySlug, Guid articleId, string? locale,
        CancellationToken token) => GetPreviewArticleAsync(rootCategorySlug, null, articleId, locale, token);

    public async Task<ViewerCategoryImage> GetPreviewCategoryImageAsync(string rootCategorySlug, Guid categoryId,
        CancellationToken token)
    {
        RequireInternalUser();
        var source = await repository.GetPreviewCategoryImageAsync(NormalizeSlug(rootCategorySlug), categoryId,
            token) ?? throw new NotFoundException("The category image was not found.");
        return await LoadCategoryImageAsync(source, token);
    }

    private async Task<ViewerArticle> GetPreviewArticleAsync(string rootCategorySlug, string? articleSlug,
        Guid? articleId, string? locale, CancellationToken token)
    {
        RequireInternalUser();
        if (articleId == Guid.Empty || articleSlug is not null && string.IsNullOrWhiteSpace(articleSlug))
            throw new NotFoundException("The article was not found.");
        var source = await repository.GetPreviewArticleAsync(NormalizeSlug(rootCategorySlug),
            NormalizeLocale(locale), articleSlug?.Trim() ?? string.Empty, articleId, token) ??
            throw new NotFoundException("The article was not found.");
        return await LoadArticleAsync(source, token);
    }

    private async Task<ViewerArticle> LoadArticleAsync(ViewerArticleSource source, CancellationToken token)
    {
        try
        {
            await using var stream = await storage.DownloadAsync(options.Value.ArticleContentContainerName,
                source.ContentJsonPath, token);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: token);
            return new(source.Id, source.Title, source.Slug, source.CategoryId, source.CategoryName,
                source.CategoryPath, source.UpdatedAt, document.RootElement.Clone(), source.ActiveLanguage,
                source.Languages, source.AvailableTranslations);
        }
        catch (Exception exception) when (exception is not OperationCanceledException and not NotFoundException)
        {
            throw new NotFoundException("The article was not found.");
        }
    }

    private async Task<ViewerCategoryImage> LoadCategoryImageAsync(ViewerCategoryImageSource source,
        CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(source.StoragePath) || Path.IsPathRooted(source.StoragePath) ||
            source.StoragePath.Contains("..", StringComparison.Ordinal) ||
            source.StoragePath.Contains('\\'))
            throw new NotFoundException("The category image was not found.");
        try
        {
            var stream = await storage.DownloadAsync(options.Value.MediaContainerName, source.StoragePath, token);
            return new(stream, source.MimeType, source.FileName);
        }
        catch (Exception exception) when (exception is not OperationCanceledException and not NotFoundException)
        {
            throw new NotFoundException("The category image was not found.");
        }
    }

    private static IReadOnlyList<ViewerCategoryNode> BuildTree(IReadOnlyList<ViewerCategoryData> categories)
    {
        if (categories.Count == 0) return [];
        var root = categories.OrderBy(item => item.Depth).First();
        var ids = categories.Select(item => item.Id).ToHashSet();
        var children = categories.Where(item => item.ParentId is { } parent && ids.Contains(parent))
            .GroupBy(item => item.ParentId!.Value).ToDictionary(group => group.Key,
                group => group.OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ToArray());
        ViewerCategoryNode Map(ViewerCategoryData item) => new(item.Id, item.Id == root.Id ? null : item.ParentId,
            item.Name, item.Slug, item.Description, item.SortOrder, item.Path, item.Depth - root.Depth,
            item.ArticleCount, children.TryGetValue(item.Id, out var values) ? values.Select(Map).ToArray() : [],
            item.HasViewerImage, item.ViewerIcon, item.DisplayColor);
        return [Map(root)];
    }

    private static void ValidateSearch(string query)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length > 200)
            throw new BusinessRuleException("A Viewer search query between 1 and 200 characters is required.");
    }

    private void RequireInternalUser()
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        _ = currentUser.UserId;
    }

    private ICurrentViewer RequireViewer()
    {
        if (!currentViewer.IsAuthenticated) throw new UnauthorizedAccessException();
        return currentViewer;
    }

    private static string NormalizeSlug(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 100) throw new NotFoundException();
        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeLocale(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (value.Length > 35) throw new NotFoundException("The language was not found.");
        return value.Trim().ToLowerInvariant();
    }
}
