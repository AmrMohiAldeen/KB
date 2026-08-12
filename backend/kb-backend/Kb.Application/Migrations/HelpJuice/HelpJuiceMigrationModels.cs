using System.Text.Json;

namespace Kb.Application.Migrations.HelpJuice;

public static class HelpJuiceMigrationStatuses
{
    public const string ValidationFailed = "ValidationFailed";
    public const string Completed = "Completed";
    public const string CompletedWithErrors = "CompletedWithErrors";
}

public static class MigrationConflictBehaviors
{
    public const string Skip = "Skip";
    public const string UpdateExisting = "UpdateExisting";
    public const string CreateCopy = "CreateCopy";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { Skip, UpdateExisting, CreateCopy };
}

public sealed record HelpJuiceMigrationOptions(
    bool ImportPublished = true,
    bool ImportUnpublishedAsDrafts = true,
    bool ImportCategories = true,
    bool ImportMedia = true,
    bool PreserveTimestamps = true,
    string ConflictBehavior = MigrationConflictBehaviors.Skip)
{
    public string ToJson() => JsonSerializer.Serialize(this);
    public static HelpJuiceMigrationOptions FromJson(string? value) =>
        string.IsNullOrWhiteSpace(value) ? new() : JsonSerializer.Deserialize<HelpJuiceMigrationOptions>(value) ?? new();
}

public sealed class HelpJuiceMigrationLimits
{
    public const long DefaultMaxPackageSizeBytes = 512L * 1024 * 1024;
    public const long DefaultMaxExtractedSizeBytes = 2L * 1024 * 1024 * 1024;
    public const int DefaultMaxEntries = 20_000;
    public const int DefaultMaxCsvRows = 500_000;
    public const int DefaultBatchSize = 50;
    public const int DefaultMaxCompressionRatio = 200;

    public long MaxPackageSizeBytes { get; set; } = DefaultMaxPackageSizeBytes;
    public long MaxExtractedSizeBytes { get; set; } = DefaultMaxExtractedSizeBytes;
    public long MaxEntrySizeBytes { get; set; } = 256L * 1024 * 1024;
    public long MaxArticleContentSizeBytes { get; set; } = 2L * 1024 * 1024;
    public int MaxEntries { get; set; } = DefaultMaxEntries;
    public int MaxCsvRows { get; set; } = DefaultMaxCsvRows;
    public int BatchSize { get; set; } = DefaultBatchSize;
    public int MaxCompressionRatio { get; set; } = DefaultMaxCompressionRatio;
}

public sealed record MigrationUploadFile(string FileName, string? ContentType, long Length, Stream Content);
public sealed record MigrationIssueData(Guid Id, string Severity, string? FileName, int? RowNumber,
    string? ExternalEntityType, string? ExternalId, string ErrorCode, string Message,
    string? SourceDataSummary, DateTime CreatedAt);
public sealed record HelpJuiceValidationSummary(int TotalArticles, int PublishedArticles, int UnpublishedArticles,
    int Categories, int CategoryDepth, int ArticlesMissingAnswers, int DuplicateIds, int DuplicateSlugs,
    int InvalidCategoryReferences, int MissingMedia, IReadOnlyList<string> AvailableFiles,
    IReadOnlyList<string> MissingRequiredFiles, IReadOnlyList<string> UnsupportedFiles,
    int BlockingErrorCount, int WarningCount);
public sealed record HelpJuiceMigrationResult(int ImportedItems, int UpdatedItems, int SkippedItems, int FailedItems,
    int CategoryImported, int CategoryUpdated, int CategorySkipped, int PublishedImported, int DraftImported,
    int ArchivedImported, int MediaImported, int MediaReused, int UnresolvedMedia, int UnsupportedData, int WarningCount);
public sealed record HelpJuiceMigrationPhase(string Phase, string Status, int TotalItems, int ProcessedItems,
    int ImportedItems, int UpdatedItems, int SkippedItems, int FailedItems);
public sealed record HelpJuiceMigrationExecutionResult(Guid JobId, string Status, string OriginalFileName, DateTime StartedAt,
    DateTime CompletedAt, HelpJuiceMigrationOptions Options, HelpJuiceValidationSummary Validation,
    HelpJuiceMigrationResult? Result, IReadOnlyList<HelpJuiceMigrationPhase> Phases,
    IReadOnlyList<MigrationIssueData> Issues);
public sealed record HelpJuiceMigrationPreviewArticle(string ExternalId, int QuestionRowNumber,
    string? AnswerExternalId, int? AnswerRowNumber, string Title, string Slug, string? Description,
    bool IsPublished, bool IsArchived, DateTime? CreatedAt, DateTime? UpdatedAt, string? CategoryExternalId,
    string? CategoryLocation, string ContentHtml, int ContentTextLength,
    IReadOnlyDictionary<string, string> SourceMetadata, IReadOnlyList<MigrationIssueData> Issues);
public sealed record HelpJuiceMigrationPreview(int PreviewLimit, int SourceArticleCount, int SourceCategoryCount,
    bool IsLimited, IReadOnlyList<string> AvailableFiles, IReadOnlyList<string> MissingRequiredFiles,
    IReadOnlyList<string> UnsupportedFiles, IReadOnlyList<MigrationIssueData> PackageIssues,
    IReadOnlyList<HelpJuiceMigrationPreviewArticle> Articles);

public sealed record CsvRow(int RowNumber, IReadOnlyDictionary<string, string> Values)
{ public string this[string key] => Values.TryGetValue(key, out var value) ? value : string.Empty; }
public sealed record ParsedCsv(string FileName, IReadOnlyList<string> Headers, IReadOnlyList<CsvRow> Rows);
public sealed record PackageContents(string RootPath, IReadOnlyDictionary<string, string> KnownCsvFiles,
    IReadOnlyList<string> MediaFiles, IReadOnlyList<string> AvailableFiles, IReadOnlyList<string> UnsupportedFiles) : IDisposable
{
    public void Dispose() { if (Directory.Exists(RootPath)) Directory.Delete(RootPath, recursive: true); }
}
public sealed record HelpJuiceHtmlConversion(string TiptapJson, string RenderedHtml, string PlainText,
    IReadOnlyList<(string Code, string Message)> Warnings, IReadOnlyList<string> MediaSources);
public sealed record HelpJuiceLinkResolution(string Url, string? WarningCode = null, string? WarningMessage = null);
public enum MigrationWriteDisposition { Imported, Updated, Skipped }
public sealed record MigrationWriteResult(Guid InternalId, MigrationWriteDisposition Disposition, Guid? DraftId = null, Guid? VersionId = null);
public sealed record ImportedCategoryData(string ExternalId, string Name, string Slug, Guid? ParentId, int Depth, int SortOrder);
public sealed record ImportedMediaData(string ExternalId, Guid Id, string OriginalFileName, string StoredFileName, string MimeType,
    string Extension, long Size, string StoragePath, string Hash, Guid UserId, DateTime UploadedAt);
public sealed record StagedArticleContent(string JsonPath, string HtmlPath, string TextPath, string Hash, long Size,
    IReadOnlyCollection<Guid> MediaIds, string? VersionJsonPath = null, string? VersionHtmlPath = null,
    string? VersionTextPath = null);
public sealed record ImportedArticleData(string ExternalId, string Title, string Slug, string? Description,
    Guid? CategoryId, Guid UserId, string Status, bool CreatePublishedVersion, DateTime CreatedAt,
    DateTime UpdatedAt, DateTime? PublishedAt, StagedArticleContent Content,
    IReadOnlyDictionary<string, string>? SourceMetadata = null, int Position = 0);

public interface IHelpJuiceImportWriter
{
    void ResetState();
    Task WriteOperationAuditAsync(Guid operationId, string action, string status, Guid actorId,
        CancellationToken cancellationToken);
    Task<Guid> StartOrResumeJobAsync(Guid proposedJobId, string packageHash, string optionsJson, Guid actorId,
        DateTime startedAt, CancellationToken cancellationToken);
    Task PersistJobResultAsync(Guid jobId, string status, string summaryJson,
        IReadOnlyList<MigrationIssueData> issues, DateTime completedAt, CancellationToken cancellationToken);
    Task<IReadOnlySet<string>> GetActiveArticleSlugsAsync(CancellationToken cancellationToken);
    Task<MigrationWriteResult> WriteCategoryAsync(Guid operationId, ImportedCategoryData category,
        string conflictBehavior, Guid actorId, CancellationToken cancellationToken);
    Task<MigrationWriteResult> WriteMediaAsync(Guid operationId, ImportedMediaData media, CancellationToken cancellationToken);
    Task<MigrationWriteResult> WriteArticleAsync(Guid operationId, ImportedArticleData article,
        string conflictBehavior, CancellationToken cancellationToken);
}
