using System.Text.Json;

namespace Kb.Application.Viewer;

public interface ICurrentViewer
{
    bool IsAuthenticated { get; }
    Guid SessionId { get; }
    Guid CustomerId { get; }
    string ExternalUserId { get; }
    string ExternalUserEmail { get; }
}

public sealed record ViewerHandoffIdentity(string HandoffId, string ExternalUserId, string ExternalUserEmail,
    string ExternalCustomerId, IReadOnlyList<string> SolutionSlugs, DateTime IssuedAt, DateTime ExpiresAt,
    string? IpAddress, string? UserAgent);
public sealed record ViewerSessionData(Guid SessionId, Guid CustomerId, string ExternalUserId,
    string ExternalUserEmail, DateTime ExpiresAt, IReadOnlyList<ViewerSolutionReference> Solutions);
public sealed record ViewerSolutionReference(Guid SolutionId, string Slug);
public sealed record ViewerSessionValidation(bool IsValid, ViewerSessionData? Session);
public sealed record ViewerPortalData(Guid SolutionId, string Slug, string Name, string? Description)
{
    // In preview mode this value is the selected category ID; Viewer rendering only needs the resolved root ID.
    public Guid RootId => SolutionId;
}
public sealed record ViewerCategoryData(Guid Id, Guid? ParentId, string Name, string Slug, string? Description,
    int SortOrder, string? Path, int Depth, int ArticleCount, bool HasViewerImage = false,
    string? ViewerIcon = null);
public sealed record ViewerCategoryNode(Guid Id, Guid? ParentId, string Name, string Slug, string? Description,
    int SortOrder, string? Path, int Depth, int ArticleCount, IReadOnlyList<ViewerCategoryNode> Children,
    bool HasViewerImage = false, string? ViewerIcon = null);
public sealed record ViewerCategoryImageSource(string StoragePath, string MimeType, string FileName);
public sealed record ViewerCategoryImage(Stream Content, string MimeType, string FileName);
public sealed record ViewerArticleSummary(Guid Id, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt);
public sealed record ViewerArticleSource(Guid Id, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, string ContentJsonPath, Guid? SolutionId);
public sealed record ViewerArticle(Guid Id, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, JsonElement Content);

public sealed class ViewerAuthenticationOptions
{
    public const string CookieName = "__Host-kb-viewer";
    public TimeSpan SessionLifetime { get; set; } = TimeSpan.FromHours(1);
    public TimeSpan MaximumHandoffLifetime { get; set; } = TimeSpan.FromMinutes(5);
    public string ArticleContentContainerName { get; set; } = "article-content";
    public string MediaContainerName { get; set; } = "media";
}

public interface IViewerRepository
{
    Task<ViewerSessionData> CreateSessionAsync(ViewerHandoffIdentity handoff, DateTime sessionExpiresAt,
        CancellationToken cancellationToken);
    Task<ViewerSessionValidation> ValidateSessionAsync(Guid sessionId, DateTime now,
        CancellationToken cancellationToken);
    Task RevokeSessionAsync(Guid sessionId, DateTime now, string reason, CancellationToken cancellationToken);
    Task<ViewerPortalData> GetPortalAsync(Guid sessionId, string solutionSlug, CancellationToken cancellationToken);
    Task<IReadOnlyList<ViewerCategoryData>> GetCategoriesAsync(Guid sessionId, string solutionSlug,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<ViewerArticleSummary>> GetArticlesAsync(Guid sessionId, string solutionSlug, string? search,
        Guid? categoryId, CancellationToken cancellationToken);
    Task<ViewerArticleSource?> GetArticleAsync(Guid sessionId, string solutionSlug, string slug,
        Guid? articleId, CancellationToken cancellationToken);
    Task<ViewerCategoryImageSource?> GetCategoryImageAsync(Guid sessionId, string solutionSlug, Guid categoryId,
        CancellationToken cancellationToken);
    Task<ViewerPortalData> GetPreviewPortalAsync(string rootCategorySlug, CancellationToken cancellationToken);
    Task<IReadOnlyList<ViewerCategoryData>> GetPreviewCategoriesAsync(string rootCategorySlug,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<ViewerArticleSummary>> GetPreviewArticlesAsync(string rootCategorySlug, string? search,
        Guid? categoryId, CancellationToken cancellationToken);
    Task<ViewerArticleSource?> GetPreviewArticleAsync(string rootCategorySlug, string slug, Guid? articleId,
        CancellationToken cancellationToken);
    Task<ViewerCategoryImageSource?> GetPreviewCategoryImageAsync(string rootCategorySlug, Guid categoryId,
        CancellationToken cancellationToken);
    Task RecordArticleViewAsync(ICurrentViewer viewer, ViewerArticleSource article, string? ipAddress,
        string? userAgent, CancellationToken cancellationToken);
}

public interface IViewerSearchClient
{
    Task<IReadOnlyList<ViewerArticleSummary>> SearchAsync(Guid solutionId, string query, int limit,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<ViewerArticleSummary>> SearchPreviewAsync(Guid rootCategoryId, string query, int limit,
        CancellationToken cancellationToken);
}
