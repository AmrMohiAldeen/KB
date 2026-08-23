namespace Kb.Application.Articles;

public enum ArticleSortField { UpdatedAt, CreatedAt, Title, Position }

public sealed record ArticleListQuery(string? Search, Guid? CategoryId, string? Status, Guid? OwnerId,
    int Page, int PageSize, ArticleSortField SortBy, bool Descending);
public sealed record PagedArticleData(IReadOnlyList<ArticleListData> Items, int Page, int PageSize, long TotalCount);
public sealed record CategoryReference(Guid Id, string Name, string Slug, string? Path);
public sealed record UserReference(Guid Id, string Name);

public sealed record ArticleListData(Guid Id, string Title, string Slug, string Status,
    CategoryReference? Category, UserReference Owner, Guid? CurrentDraftId, Guid? CurrentPublishedVersionId,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? PublishedAt, bool IsCurrentDraftLocked,
    UserReference? LockedBy, int Position, string Visibility = "Public",
    IReadOnlyList<CategoryReference>? Categories = null);

public sealed record ArticleData(Guid Id, string Title, string Slug, string Status, CategoryReference? Category,
    UserReference Owner, DraftData? CurrentDraft, PublishedVersionData? CurrentPublishedVersion,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? SubmittedAt, DateTime? ApprovedAt, DateTime? PublishedAt,
    string Visibility = "Public", IReadOnlyList<CategoryReference>? Categories = null);

public sealed record DraftData(Guid Id, string ContentJsonPath, string? RenderedHtmlPath, string? PlainTextPath,
    string? ContentHash, long ContentSizeBytes, byte[] RowVersion, string Status, bool IsLocked,
    UserReference? LockedBy, DateTime? LockedAt, UserReference CreatedBy, UserReference? UpdatedBy,
    DateTime CreatedAt, DateTime UpdatedAt);

public sealed record PublishedVersionData(Guid Id, int Number, string ContentJsonPath, string? RenderedHtmlPath,
    string? PlainTextPath, string? ContentHash, long ContentSizeBytes, UserReference CreatedBy,
    DateTime CreatedAt, UserReference? PublishedBy, DateTime? PublishedAt);

public sealed record ArticleMutationData(Guid Id, Guid OwnerId, Guid? CategoryId, string Title, string Slug,
    int Position, Guid? CurrentDraftId,
    byte[]? CurrentDraftRowVersion, string Status, bool IsDeleted, string Visibility = "Public");
public sealed record CreateArticleCommand(string Title, Guid CategoryId, string? Slug, string Visibility = "Public",
    IReadOnlyList<Guid>? CategoryIds = null);
public sealed record UpdateArticleCommand(string Title, Guid CategoryId, string? Slug, byte[] RowVersion,
    string? Visibility = null, IReadOnlyList<Guid>? CategoryIds = null);
public sealed record NewArticleData(string Title, string Slug, Guid CategoryId, Guid OwnerId, DateTime CreatedAt,
    string Visibility = "Public", IReadOnlyList<Guid>? CategoryIds = null);
public sealed record ArticleAuditData(Guid ActorId, string Action, string MetadataJson, DateTime CreatedAt);
