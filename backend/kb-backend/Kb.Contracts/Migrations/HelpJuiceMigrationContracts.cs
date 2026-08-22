namespace Kb.Contracts.Migrations;

public sealed record HelpJuiceMigrationOptionsRequest(
    bool ImportPublished = true,
    bool ImportUnpublishedAsDrafts = true,
    bool ImportCategories = true,
    bool ImportMedia = true,
    bool PreserveTimestamps = true,
    string ConflictBehavior = "Skip");

public sealed record MigrationIssueResponse(
    Guid Id,
    string Severity,
    string? FileName,
    int? RowNumber,
    string? ExternalEntityType,
    string? ExternalId,
    string ErrorCode,
    string Message,
    string? SourceDataSummary,
    DateTime CreatedAt);

public sealed record HelpJuiceMigrationPreviewArticleResponse(
    string ExternalId,
    int QuestionRowNumber,
    string? AnswerExternalId,
    int? AnswerRowNumber,
    string Title,
    string Slug,
    string? Description,
    bool IsPublished,
    bool IsArchived,
    DateTime? CreatedAt,
    DateTime? UpdatedAt,
    string? CategoryExternalId,
    string? CategoryLocation,
    string Visibility,
    string? HelpJuiceAuthorId,
    Guid? AuthorUserId,
    string? AuthorName,
    string ContentHtml,
    int ContentTextLength,
    IReadOnlyDictionary<string, string> SourceMetadata,
    IReadOnlyList<MigrationIssueResponse> Issues);

public sealed record HelpJuiceMigrationPreviewResponse(
    int PreviewLimit,
    int SourceArticleCount,
    int SourceCategoryCount,
    bool IsLimited,
    IReadOnlyList<string> AvailableFiles,
    IReadOnlyList<string> MissingRequiredFiles,
    IReadOnlyList<string> UnsupportedFiles,
    IReadOnlyList<MigrationIssueResponse> PackageIssues,
    IReadOnlyList<HelpJuiceMigrationPreviewArticleResponse> Articles);

public sealed record HelpJuiceValidationSummaryResponse(
    int TotalArticles,
    int PublishedArticles,
    int UnpublishedArticles,
    int Categories,
    int CategoryDepth,
    int ArticlesMissingAnswers,
    int DuplicateIds,
    int DuplicateSlugs,
    int InvalidCategoryReferences,
    int MissingMedia,
    IReadOnlyList<string> AvailableFiles,
    IReadOnlyList<string> MissingRequiredFiles,
    IReadOnlyList<string> UnsupportedFiles,
    int BlockingErrorCount,
    int WarningCount);

public sealed record HelpJuiceMigrationResultResponse(
    int ImportedItems,
    int UpdatedItems,
    int SkippedItems,
    int FailedItems,
    int CategoryImported,
    int CategoryUpdated,
    int CategorySkipped,
    int PublishedImported,
    int DraftImported,
    int ArchivedImported,
    int MediaImported,
    int MediaReused,
    int UnresolvedMedia,
    int UnsupportedData,
    int WarningCount);

public sealed record HelpJuiceMigrationPhaseResponse(
    string Phase,
    string Status,
    int TotalItems,
    int ProcessedItems,
    int ImportedItems,
    int UpdatedItems,
    int SkippedItems,
    int FailedItems);

public sealed record HelpJuiceMigrationResponse(
    Guid JobId,
    string Status,
    string OriginalFileName,
    DateTime StartedAt,
    DateTime CompletedAt,
    HelpJuiceMigrationOptionsRequest Options,
    HelpJuiceValidationSummaryResponse Validation,
    HelpJuiceMigrationResultResponse? Result,
    IReadOnlyList<HelpJuiceMigrationPhaseResponse> Phases,
    IReadOnlyList<MigrationIssueResponse> Issues);

public sealed record HelpJuiceUserMigrationResponse(
    Guid JobId,
    string Status,
    string OriginalFileName,
    DateTime StartedAt,
    DateTime CompletedAt,
    int TotalRows,
    int ImportedUsers,
    int UpdatedUsers,
    int SkippedUsers,
    int FailedUsers,
    IReadOnlyList<MigrationIssueResponse> Issues);
