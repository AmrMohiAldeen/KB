namespace Kb.Application.Migrations.HelpJuice;

public sealed record ImportedHelpJuiceUser(
    string HelpJuiceUserId,
    string? HelpJuiceFirstName,
    string? HelpJuiceLastName,
    string? HelpJuiceJobTitle,
    string? HelpJuiceEmail,
    string? ValidEmail,
    bool? HelpJuiceNotifyAboutDrafts,
    bool? HelpJuiceNotifyAboutArticles,
    bool? HelpJuiceWeeklyAnalyticsSubscribed,
    bool? HelpJuiceWeeklyArticlesSubscribed,
    int? HelpJuiceSignInCount,
    DateTime? HelpJuiceCurrentSignInAt,
    DateTime? HelpJuiceLastSignInAt,
    string? HelpJuiceCurrentSignInIp,
    string? HelpJuiceLastSignInIp,
    DateTime? HelpJuiceCreatedAt,
    DateTime? HelpJuiceUpdatedAt,
    DateTime? HelpJuicePasswordChangedAt,
    DateTime? HelpJuiceDeactivatedAt,
    string? HelpJuiceRoleId,
    DateTime MigrationAt);

public sealed record HelpJuiceUserParseDiagnostic(string Severity, string ErrorCode, string Message);
public sealed record ParsedHelpJuiceUser(int RowNumber, ImportedHelpJuiceUser? User, bool CanWrite,
    IReadOnlyList<HelpJuiceUserParseDiagnostic> Diagnostics);
public sealed record HelpJuiceUserCsvParseResult(IReadOnlyList<ParsedHelpJuiceUser> Rows);
public sealed record HelpJuiceUserWriteDiagnostic(string Severity, string ErrorCode, string Message);
public sealed record HelpJuiceUserWriteResult(MigrationWriteDisposition Disposition,
    IReadOnlyList<HelpJuiceUserWriteDiagnostic> Diagnostics);
public sealed record HelpJuiceUserMigrationResult(Guid JobId, string Status, string OriginalFileName,
    DateTime StartedAt, DateTime CompletedAt, int TotalRows, int ImportedUsers, int UpdatedUsers,
    int SkippedUsers, int FailedUsers, IReadOnlyList<MigrationIssueData> Issues);

public interface IHelpJuiceUserMigrationStore
{
    void ResetState();
    Task<Guid> StartJobAsync(Guid jobId, string packageHash, string originalFileName, Guid actorId,
        DateTime startedAt, CancellationToken cancellationToken);
    Task<HelpJuiceUserWriteResult> WriteUserAsync(ImportedHelpJuiceUser user,
        CancellationToken cancellationToken);
    Task PersistJobResultAsync(Guid jobId, string status, string summaryJson,
        IReadOnlyList<MigrationIssueData> issues, DateTime completedAt,
        CancellationToken cancellationToken);
}
