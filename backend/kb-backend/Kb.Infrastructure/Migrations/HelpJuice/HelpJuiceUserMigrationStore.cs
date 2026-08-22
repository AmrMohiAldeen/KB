using System.Data;
using System.Text.Json;
using Kb.Application.Migrations.HelpJuice;
using Kb.Infrastructure.Data;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Migrations.HelpJuice;

public sealed class HelpJuiceUserMigrationStore(KbDbContext db) : IHelpJuiceUserMigrationStore
{
    public void ResetState() => db.ChangeTracker.Clear();

    public async Task<Guid> StartJobAsync(Guid jobId, string packageHash, string originalFileName,
        Guid actorId, DateTime startedAt, CancellationToken ct)
    {
        db.MigrationJobs.Add(new MigrationJob
        {
            MigrationJobId = jobId,
            SourceSystem = "HelpJuice",
            PackageHash = packageHash,
            Status = "Running",
            RequestedByFk = actorId,
            OptionsJson = JsonSerializer.Serialize(new { migrationType = "Users", originalFileName }),
            StartedAt = startedAt
        });
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();
        return jobId;
    }

    public async Task<HelpJuiceUserWriteResult> WriteUserAsync(ImportedHelpJuiceUser source,
        CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var diagnostics = new List<HelpJuiceUserWriteDiagnostic>();
        var normalizedId = source.HelpJuiceUserId.ToUpper();
        var byId = await db.Users.SingleOrDefaultAsync(
            user => user.HelpJuiceUserId != null && user.HelpJuiceUserId.ToUpper() == normalizedId, ct);
        if (byId is not null)
        {
            User? emailOwner = null;
            if (source.ValidEmail is not null)
            {
                var normalizedEmail = source.ValidEmail.ToUpper();
                emailOwner = await db.Users.AsNoTracking().SingleOrDefaultAsync(
                    user => user.Email.ToUpper() == normalizedEmail, ct);
                if (emailOwner is not null && emailOwner.UserId != byId.UserId)
                    diagnostics.Add(new("Warning", "HELPJUICE_USER_NATIVE_EMAIL_CONFLICT",
                        "Incoming source email belongs to another native user; HelpJuice metadata was updated but native email was preserved."));
            }
            if (IsMigrationPlaceholder(byId) && source.ValidEmail is not null &&
                (emailOwner is null || emailOwner.UserId == byId.UserId))
            {
                byId.Email = source.ValidEmail;
                byId.FullName = BuildFullName(source, diagnostics);
                byId.IsActive = source.HelpJuiceDeactivatedAt is null;
            }
            ApplyMetadata(byId, source);
            await SaveAndCommitAsync(transaction, ct);
            return new(MigrationWriteDisposition.Updated, diagnostics);
        }

        if (source.ValidEmail is null)
        {
            await transaction.RollbackAsync(ct);
            return new(MigrationWriteDisposition.Skipped,
                [new("Error", "HELPJUICE_USER_EMAIL_REQUIRED_FOR_CREATE",
                    "A valid nonblank source email is required to create or email-match a native user.")]);
        }

        var emailKey = source.ValidEmail.ToUpper();
        var byEmail = await db.Users.SingleOrDefaultAsync(user => user.Email.ToUpper() == emailKey, ct);
        if (byEmail is not null)
        {
            if (!string.IsNullOrWhiteSpace(byEmail.HelpJuiceUserId))
            {
                await transaction.RollbackAsync(ct);
                return new(MigrationWriteDisposition.Skipped,
                    [new("Error", "HELPJUICE_USER_ID_CONFLICT",
                        $"The email-matched native user is already linked to HelpJuice user '{byEmail.HelpJuiceUserId}'.")]);
            }
            ApplyMetadata(byEmail, source);
            await SaveAndCommitAsync(transaction, ct);
            return new(MigrationWriteDisposition.Updated, diagnostics);
        }

        var fullName = BuildFullName(source, diagnostics);
        var user = new User
        {
            UserId = Guid.NewGuid(),
            Email = source.ValidEmail,
            FullName = fullName,
            IsActive = source.HelpJuiceDeactivatedAt is null,
            CreatedAt = source.MigrationAt
        };
        ApplyMetadata(user, source);
        db.Users.Add(user);
        await SaveAndCommitAsync(transaction, ct);
        return new(MigrationWriteDisposition.Imported, diagnostics);
    }

    public async Task PersistJobResultAsync(Guid jobId, string status, string summaryJson,
        IReadOnlyList<MigrationIssueData> issues, DateTime completedAt, CancellationToken ct)
    {
        var job = await db.MigrationJobs.SingleAsync(item => item.MigrationJobId == jobId, ct);
        job.Status = status;
        job.SummaryJson = summaryJson;
        job.CompletedAt = completedAt;
        var previous = await db.MigrationJobIssues.Where(item => item.MigrationJobIdFk == jobId).ToListAsync(ct);
        db.MigrationJobIssues.RemoveRange(previous);
        foreach (var issue in issues)
            db.MigrationJobIssues.Add(new MigrationJobIssue
            {
                MigrationIssueId = issue.Id,
                MigrationJobIdFk = jobId,
                Severity = issue.Severity,
                FileName = issue.FileName,
                RowNumber = issue.RowNumber,
                ExternalEntityType = issue.ExternalEntityType,
                ExternalId = issue.ExternalId,
                ErrorCode = issue.ErrorCode,
                Message = issue.Message,
                SourceDataSummary = issue.SourceDataSummary,
                CreatedAt = issue.CreatedAt
            });
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();
    }

    public async Task<HelpJuiceUserMigrationStatus> GetLatestStatusAsync(CancellationToken ct)
    {
        var jobs = db.MigrationJobs.AsNoTracking().Where(job =>
            job.SourceSystem == "HelpJuice" &&
            job.OptionsJson != null &&
            job.OptionsJson.Contains("\"migrationType\":\"Users\""));
        var completed = await jobs
            .Where(job => job.Status == HelpJuiceMigrationStatuses.Completed ||
                          job.Status == HelpJuiceMigrationStatuses.CompletedWithErrors)
            .OrderByDescending(job => job.CompletedAt)
            .Select(job => new { job.MigrationJobId, job.Status, job.CompletedAt })
            .FirstOrDefaultAsync(ct);
        if (completed is not null)
            return new(true, completed.MigrationJobId, completed.Status, completed.CompletedAt);

        var latest = await jobs.OrderByDescending(job => job.StartedAt)
            .Select(job => new { job.MigrationJobId, job.Status, job.CompletedAt })
            .FirstOrDefaultAsync(ct);
        return latest is null
            ? new(false, null, null, null)
            : new(false, latest.MigrationJobId, latest.Status, latest.CompletedAt);
    }

    private async Task SaveAndCommitAsync(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction,
        CancellationToken ct)
    {
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        db.ChangeTracker.Clear();
    }

    private static void ApplyMetadata(User target, ImportedHelpJuiceUser source)
    {
        target.HelpJuiceUserId = source.HelpJuiceUserId;
        target.HelpJuiceFirstName = source.HelpJuiceFirstName;
        target.HelpJuiceLastName = source.HelpJuiceLastName;
        target.HelpJuiceJobTitle = source.HelpJuiceJobTitle;
        target.HelpJuiceEmail = source.HelpJuiceEmail;
        target.HelpJuiceNotifyAboutDrafts = source.HelpJuiceNotifyAboutDrafts;
        target.HelpJuiceNotifyAboutArticles = source.HelpJuiceNotifyAboutArticles;
        target.HelpJuiceWeeklyAnalyticsSubscribed = source.HelpJuiceWeeklyAnalyticsSubscribed;
        target.HelpJuiceWeeklyArticlesSubscribed = source.HelpJuiceWeeklyArticlesSubscribed;
        target.HelpJuiceSignInCount = source.HelpJuiceSignInCount;
        target.HelpJuiceCurrentSignInAt = source.HelpJuiceCurrentSignInAt;
        target.HelpJuiceLastSignInAt = source.HelpJuiceLastSignInAt;
        target.HelpJuiceCurrentSignInIp = source.HelpJuiceCurrentSignInIp;
        target.HelpJuiceLastSignInIp = source.HelpJuiceLastSignInIp;
        target.HelpJuiceCreatedAt = source.HelpJuiceCreatedAt;
        target.HelpJuiceUpdatedAt = source.HelpJuiceUpdatedAt;
        target.HelpJuicePasswordChangedAt = source.HelpJuicePasswordChangedAt;
        target.HelpJuiceDeactivatedAt = source.HelpJuiceDeactivatedAt;
        target.HelpJuiceRoleId = source.HelpJuiceRoleId;
    }

    private static string BuildFullName(ImportedHelpJuiceUser source,
        ICollection<HelpJuiceUserWriteDiagnostic> diagnostics)
    {
        var name = string.Join(' ', new[] { source.HelpJuiceFirstName, source.HelpJuiceLastName }
            .Where(value => !string.IsNullOrWhiteSpace(value)));
        if (name.Length is > 0 and <= 200) return name;
        var validEmail = source.ValidEmail ?? throw new InvalidOperationException(
            "A valid email is required to construct a native user name.");
        var fallback = validEmail[..validEmail.IndexOf('@')];
        if (name.Length > 200)
            diagnostics.Add(new("Warning", "HELPJUICE_USER_FULL_NAME_FALLBACK",
                "Combined source first and last name exceeds the native 200-character limit; the email local-part was used without truncating source metadata."));
        return fallback[..Math.Min(fallback.Length, 200)];
    }

    private static bool IsMigrationPlaceholder(User user) =>
        user.Email.EndsWith("@helpjuice.invalid", StringComparison.OrdinalIgnoreCase);
}
