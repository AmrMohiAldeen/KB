using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Exceptions;
using Microsoft.Extensions.Options;

namespace Kb.Application.Migrations.HelpJuice;

public sealed class HelpJuiceUserMigrationService(
    IHelpJuiceUserMigrationStore store,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    IOptions<HelpJuiceMigrationLimits> limitsAccessor)
{
    private readonly HelpJuiceMigrationLimits limits = limitsAccessor.Value;

    public async Task<HelpJuiceUserMigrationResult> ExecuteAsync(
        IReadOnlyList<MigrationUploadFile> files, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (files.Count != 1) throw new BusinessRuleException("Select exactly one users.csv file.");
        var file = files[0];
        var originalName = Path.GetFileName(file.FileName.Replace('\\', '/'));
        if (!originalName.Equals("users.csv", StringComparison.OrdinalIgnoreCase))
            throw new BusinessRuleException("The user migration file must be named users.csv.");
        if (file.Length <= 0 || file.Length > limits.MaxEntrySizeBytes)
            throw new BusinessRuleException("The users.csv file size is invalid.");

        var startedAt = timeProvider.GetUtcNow().UtcDateTime;
        var jobId = Guid.NewGuid();
        var path = Path.Combine(Path.GetTempPath(), $"helpjuice-users-{jobId:N}.csv");
        var jobStarted = false;
        var issues = new List<MigrationIssueData>();
        try
        {
            await CopyLimitedAsync(file.Content, path, limits.MaxEntrySizeBytes, ct);
            var packageHash = await HashFileAsync(path, ct);
            await store.StartJobAsync(jobId, packageHash, originalName, currentUser.UserId, startedAt, ct);
            jobStarted = true;

            ParsedCsv csv;
            try
            {
                csv = await HelpJuiceCsvReader.ReadAsync(path, limits.MaxCsvRows, ct);
            }
            catch (Exception exception) when (exception is InvalidDataException or DecoderFallbackException)
            {
                issues.Add(Issue("Error", null, null, "HELPJUICE_USERS_CSV_INVALID", SafeMessage(exception)));
                return await CompleteAsync(HelpJuiceMigrationStatuses.CompletedWithErrors,
                    0, 0, 0, 0, 1, issues, ct);
            }

            var missingHeaders = HelpJuiceUserCsvParser.ExpectedHeaders
                .Where(header => !csv.Headers.Contains(header, StringComparer.OrdinalIgnoreCase)).ToArray();
            if (missingHeaders.Length > 0)
            {
                foreach (var header in missingHeaders)
                    issues.Add(Issue("Error", null, null, "HELPJUICE_USER_COLUMN_MISSING",
                        $"Required users.csv column '{header}' is missing."));
                return await CompleteAsync(HelpJuiceMigrationStatuses.CompletedWithErrors,
                    csv.Rows.Count, 0, 0, csv.Rows.Count, 0, issues, ct);
            }

            var parsed = HelpJuiceUserCsvParser.Parse(csv, startedAt);
            var imported = 0;
            var updated = 0;
            var skipped = 0;
            var failed = 0;
            foreach (var row in parsed.Rows)
            {
                ct.ThrowIfCancellationRequested();
                var externalId = row.User?.HelpJuiceUserId;
                foreach (var diagnostic in row.Diagnostics)
                    issues.Add(Issue(diagnostic.Severity, row.RowNumber, externalId,
                        diagnostic.ErrorCode, diagnostic.Message));
                if (!row.CanWrite || row.User is null)
                {
                    skipped++;
                    continue;
                }

                try
                {
                    var write = await store.WriteUserAsync(row.User, ct);
                    foreach (var diagnostic in write.Diagnostics)
                        issues.Add(Issue(diagnostic.Severity, row.RowNumber, externalId,
                            diagnostic.ErrorCode, diagnostic.Message));
                    if (write.Disposition == MigrationWriteDisposition.Imported) imported++;
                    else if (write.Disposition == MigrationWriteDisposition.Updated) updated++;
                    else skipped++;
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    store.ResetState();
                    failed++;
                    issues.Add(Issue("Error", row.RowNumber, externalId,
                        "HELPJUICE_USER_IMPORT_FAILED", SafeMessage(exception)));
                }
            }

            var status = failed > 0 || issues.Any(issue => issue.Severity == "Error")
                ? HelpJuiceMigrationStatuses.CompletedWithErrors
                : HelpJuiceMigrationStatuses.Completed;
            return await CompleteAsync(status, parsed.Rows.Count, imported, updated, skipped, failed, issues, ct);
        }
        catch (OperationCanceledException)
        {
            if (jobStarted)
                try
                {
                    store.ResetState();
                    await store.PersistJobResultAsync(jobId, "Cancelled", "{}", issues,
                        timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None);
                }
                catch { }
            throw;
        }
        catch
        {
            if (jobStarted)
                try
                {
                    store.ResetState();
                    await store.PersistJobResultAsync(jobId, "Failed", "{}", issues,
                        timeProvider.GetUtcNow().UtcDateTime, CancellationToken.None);
                }
                catch { }
            throw;
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }

        async Task<HelpJuiceUserMigrationResult> CompleteAsync(string status, int rows, int imported,
            int updated, int skipped, int failed, IReadOnlyList<MigrationIssueData> diagnostics,
            CancellationToken cancellationToken)
        {
            var result = new HelpJuiceUserMigrationResult(jobId, status, originalName, startedAt,
                timeProvider.GetUtcNow().UtcDateTime, rows, imported, updated, skipped, failed, diagnostics);
            await store.PersistJobResultAsync(jobId, status, JsonSerializer.Serialize(result),
                diagnostics, result.CompletedAt, cancellationToken);
            return result;
        }
    }

    private MigrationIssueData Issue(string severity, int? row, string? externalId,
        string code, string message) =>
        new(Guid.NewGuid(), severity, "users.csv", row, "User", externalId, code, message,
            externalId is null ? null : $"HelpJuiceUserId={externalId}",
            timeProvider.GetUtcNow().UtcDateTime);

    private static async Task CopyLimitedAsync(Stream input, string path, long maximumBytes,
        CancellationToken ct)
    {
        await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None,
            64 * 1024, FileOptions.Asynchronous);
        var buffer = new byte[64 * 1024];
        long total = 0;
        while (true)
        {
            var read = await input.ReadAsync(buffer, ct);
            if (read == 0) break;
            total += read;
            if (total > maximumBytes)
                throw new BusinessRuleException("Uploaded users.csv exceeds the configured file limit.");
            await output.WriteAsync(buffer.AsMemory(0, read), ct);
        }
    }

    private static async Task<string> HashFileAsync(string path, CancellationToken ct)
    {
        await using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
            64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Convert.ToHexString(await SHA256.HashDataAsync(input, ct)).ToLowerInvariant();
    }

    private static string SafeMessage(Exception exception) =>
        exception.Message.Length <= 4000 ? exception.Message : exception.Message[..4000];
}
