namespace Kb.Contracts.Migrations;

public sealed record HelpJuiceMigrationOptionsRequest(
    bool ImportPublished = true,
    bool ImportUnpublishedAsDrafts = true,
    bool ImportCategories = true,
    bool ImportMedia = true,
    bool PreserveTimestamps = true,
    string ConflictBehavior = "Skip");

public sealed record StartHelpJuiceMigrationRequest(
    Guid JobId,
    HelpJuiceMigrationOptionsRequest Options);

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
    int CategoryImported,
    int CategoryUpdated,
    int CategorySkipped,
    int PublishedImported,
    int DraftImported,
    int MediaImported,
    int MediaReused,
    int UnresolvedMedia,
    int UnsupportedData,
    int WarningCount);

public sealed record HelpJuiceMigrationJobResponse(
    Guid Id,
    string Type,
    string Status,
    string OriginalFileName,
    Guid RequestedByUserId,
    string? RequestedByName,
    DateTime RequestedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    string CurrentPhase,
    int TotalItems,
    int ProcessedItems,
    int ImportedItems,
    int UpdatedItems,
    int SkippedItems,
    int FailedItems,
    bool CancellationRequested,
    HelpJuiceMigrationOptionsRequest Options,
    HelpJuiceValidationSummaryResponse? Validation,
    HelpJuiceMigrationResultResponse? Result,
    string? FailureCode,
    string? FailureMessage,
    IReadOnlyList<MigrationIssueResponse> Issues);

public sealed record HelpJuiceMigrationAcceptedResponse(Guid JobId, string Status, string StatusUrl);

