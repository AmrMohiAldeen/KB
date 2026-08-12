namespace Kb.Application.ExportJobs;

public sealed record ExportSnapshot(
    string EntityType,
    string Title,
    string Slug,
    IReadOnlyList<ExportSnapshotCategory> Categories,
    IReadOnlyList<ExportSnapshotArticle> Articles);

public sealed record ExportSnapshotCategory(Guid Id, Guid? ParentId, string Name, string Slug,
    int SortOrder, int Depth);

public sealed record ExportSnapshotArticle(Guid ArticleId, Guid VersionId, Guid? CategoryId,
    string Title, string Slug, int Position, string ContentJsonPath, string? RenderedHtmlPath,
    string? PlainTextPath, DateTime? PublishedAt);

public sealed record ExportJobData(Guid Id, string EntityType, Guid? ArticleId, Guid? CategoryId,
    Guid? VersionId, string ExportType, string Status, Guid RequestedById, string RequestedByName,
    DateTime RequestedAt, DateTime? StartedAt, DateTime? CompletedAt, string SnapshotJson,
    string FileName, string? ResultPath, string? ErrorMessage);

public sealed record ExportDownloadData(Stream Content, string ContentType, string FileName);

public interface IExportJobRepository
{
    Task<ExportJobData> CreateArticleAsync(Guid articleId, string exportType, Guid requestedBy,
        DateTime requestedAt, CancellationToken cancellationToken);
    Task<ExportJobData> CreateCategoryAsync(Guid categoryId, string exportType, Guid requestedBy,
        DateTime requestedAt, CancellationToken cancellationToken);
    Task<ExportJobData?> GetAsync(Guid jobId, CancellationToken cancellationToken);
    Task<bool> IsActiveUserAsync(Guid userId, CancellationToken cancellationToken);
    Task<ExportJobData?> ClaimNextAsync(DateTime startedAt, CancellationToken cancellationToken);
    Task CompleteAsync(Guid jobId, string resultPath, DateTime completedAt,
        CancellationToken cancellationToken);
    Task FailAsync(Guid jobId, string errorMessage, DateTime completedAt,
        CancellationToken cancellationToken);
}

public interface IPdfRenderer
{
    Task<Stream> RenderAsync(string html, CancellationToken cancellationToken);
}

public sealed record ExportMediaData(string MimeType, string FileName, byte[] Content);

public interface IExportMediaResolver
{
    Task<ExportMediaData?> ResolveAsync(Guid mediaId, int maximumBytes,
        CancellationToken cancellationToken);
}

public sealed class ExportOptions
{
    public string ContainerName { get; set; } = "exports";
    public string ArticleContentContainerName { get; set; } = "article-content";
    public string MediaContainerName { get; set; } = "media";
    public string? ChromiumExecutablePath { get; set; }
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(2);
    public int MaxEmbeddedMediaBytes { get; set; } = 20 * 1024 * 1024;
}
