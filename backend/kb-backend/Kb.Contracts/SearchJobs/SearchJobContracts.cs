namespace Kb.Contracts.SearchJobs;

public sealed record SearchIndexJobResponse(
    Guid SearchJobId,
    Guid ArticleId,
    Guid? VersionId,
    string JobType,
    string Status,
    int RetryCount,
    string? ErrorMessage,
    DateTime CreatedAt,
    DateTime? ProcessedAt);
