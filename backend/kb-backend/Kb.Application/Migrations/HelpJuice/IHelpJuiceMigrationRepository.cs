namespace Kb.Application.Migrations.HelpJuice;

public interface IHelpJuiceMigrationRepository
{
    Task CreateAsync(MigrationJobCreateData job, CancellationToken cancellationToken);
    Task<MigrationJobData?> GetAsync(Guid jobId, int issueLimit, CancellationToken cancellationToken);
    Task<Guid?> TryClaimValidationAsync(CancellationToken cancellationToken);
    Task<Guid?> TryClaimImportAsync(CancellationToken cancellationToken);
    Task SetValidationAsync(Guid jobId, HelpJuiceValidationSummary summary,
        IReadOnlyCollection<MigrationIssueData> issues, CancellationToken cancellationToken);
    Task MarkReadyToRunAsync(Guid jobId, HelpJuiceMigrationOptions options, CancellationToken cancellationToken);
    Task UpdateProgressAsync(Guid jobId, MigrationProgressUpdate update, CancellationToken cancellationToken);
    Task AddIssuesAsync(Guid jobId, IReadOnlyCollection<MigrationIssueData> issues, CancellationToken cancellationToken);
    Task<bool> IsCancellationRequestedAsync(Guid jobId, CancellationToken cancellationToken);
    Task RequestCancellationAsync(Guid jobId, CancellationToken cancellationToken);
    Task CompleteAsync(Guid jobId, HelpJuiceMigrationResult result, bool withErrors, CancellationToken cancellationToken);
    Task FailAsync(Guid jobId, string code, string message, CancellationToken cancellationToken);
    Task CancelAsync(Guid jobId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MigrationIssueData>> GetIssuesAsync(Guid jobId, CancellationToken cancellationToken);
    Task<Guid?> GetMappedInternalIdAsync(Guid jobId, string entityType, string externalId,
        CancellationToken cancellationToken);
    Task AddMappingAsync(Guid jobId, string entityType, string externalId, Guid internalId,
        string? metadataJson, CancellationToken cancellationToken);
}

