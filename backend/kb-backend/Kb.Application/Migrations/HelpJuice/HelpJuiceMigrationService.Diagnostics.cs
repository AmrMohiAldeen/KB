using System.Text;
using Kb.Application.Exceptions;

namespace Kb.Application.Migrations.HelpJuice;

public sealed partial class HelpJuiceMigrationService
{
    private static readonly IReadOnlySet<string> ParsedCsvFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "questions.csv", "answers.csv", "categories.csv", "categorizations.csv", "uploads.csv",
        "users.csv", "passes.csv"
    };

    public async Task<HelpJuiceDiagnosticReportFile> GenerateDiagnosticReportAsync(
        IReadOnlyList<MigrationUploadFile> files, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (files.Count == 0) throw new BusinessRuleException("Select a HelpJuice ZIP or migration files.");

        var diagnosticId = Guid.NewGuid();
        var startedAt = timeProvider.GetUtcNow().UtcDateTime;
        var originalName = files.Count == 1 ? SafeLeaf(files[0].FileName) : $"helpjuice-manual-{diagnosticId:N}.zip";
        var temporaryPackage = Path.Combine(Path.GetTempPath(), $"helpjuice-diagnostic-{diagnosticId:N}.zip");
        var reportPath = Path.Combine(Path.GetTempPath(), $"helpjuice-diagnostic-{diagnosticId:N}.csv");
        var recordsByFile = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var issues = new List<MigrationIssueData>();
        HelpJuiceSource? source = null;
        var packagedMediaCount = 0;
        var scanFailed = false;

        try
        {
            await BuildTemporaryPackageAsync(files, temporaryPackage, ct);
            await using var packageStream = new FileStream(temporaryPackage, FileMode.Open, FileAccess.Read,
                FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            using var package = await HelpJuicePackageReader.ExtractAsync(packageStream, limits, ct);
            packagedMediaCount = package.MediaFiles.Count;

            var malformed = await ScanCsvFilesAsync(package, recordsByFile, issues, ct);
            if (malformed.Any(ParsedCsvFiles.Contains)) scanFailed = true;
            var readableFiles = package.KnownCsvFiles
                .Where(item => !malformed.Contains(item.Key) || !ParsedCsvFiles.Contains(item.Key))
                .ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);
            var diagnosticPackage = new PackageContents(package.RootPath, readableFiles, package.MediaFiles,
                package.AvailableFiles, package.UnsupportedFiles);

            try
            {
                var destinationSlugs = await writer.GetActiveArticleSlugsAsync(ct);
                source = await HelpJuiceSourceParser.ParseAndValidateAsync(
                    diagnosticPackage, limits, timeProvider, destinationSlugs, ct);
                issues.AddRange(source.Issues.Where(issue => issue.ErrorCode != "REQUIRED_FILE_MISSING" ||
                    !package.KnownCsvFiles.ContainsKey(issue.FileName ?? string.Empty)));
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                scanFailed = true;
                issues.Add(DiagnosticFailure("DIAGNOSTIC_PARSER_FAILED", exception.Message));
            }

            issues.AddRange(await ValidateMediaFilesAsync(package.MediaFiles, ct));
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            scanFailed = true;
            issues.Add(DiagnosticFailure("DIAGNOSTIC_SCAN_FAILED", exception.Message));
        }
        finally
        {
            if (File.Exists(temporaryPackage)) File.Delete(temporaryPackage);
        }

        var completedAt = timeProvider.GetUtcNow().UtcDateTime;
        try
        {
            await HelpJuiceDiagnosticReportWriter.WriteAsync(reportPath, originalName, startedAt, completedAt,
                recordsByFile, packagedMediaCount, source, issues, scanFailed, ct);
        }
        catch
        {
            if (File.Exists(reportPath)) File.Delete(reportPath);
            throw;
        }

        var totalRecords = recordsByFile.Values.Sum() + packagedMediaCount;
        var errors = issues.Count(issue => issue.Severity.Equals("Error", StringComparison.OrdinalIgnoreCase));
        var warnings = issues.Count(issue => issue.Severity.Equals("Warning", StringComparison.OrdinalIgnoreCase));
        var reportName = $"{Path.GetFileNameWithoutExtension(originalName)}-helpjuice-diagnostic-{completedAt:yyyyMMdd-HHmmss}.csv";
        return new(reportPath, reportName, totalRecords, errors, warnings, scanFailed);
    }

    private async Task<HashSet<string>> ScanCsvFilesAsync(PackageContents package,
        IDictionary<string, int> recordsByFile, ICollection<MigrationIssueData> issues, CancellationToken ct)
    {
        var malformed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in package.KnownCsvFiles.OrderBy(item => item.Key, StringComparer.OrdinalIgnoreCase))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var csv = await HelpJuiceCsvReader.ReadAsync(item.Value, limits.MaxCsvRows, ct);
                recordsByFile[item.Key] = csv.Rows.Count;
            }
            catch (Exception exception) when (exception is InvalidDataException or DecoderFallbackException)
            {
                malformed.Add(item.Key);
                if (ParsedCsvFiles.Contains(item.Key))
                    issues.Add(NewIssue("Error", item.Key, ExtractCsvRow(exception.Message),
                        EntityTypeForCsv(item.Key), null, "MALFORMED_CSV", exception.Message));
            }
        }
        return malformed;
    }

    private MigrationIssueData DiagnosticFailure(string code, string message) =>
        NewIssue("Error", null, null, "Package", null, code, SafeMessage(new InvalidDataException(message)));

    private static int? ExtractCsvRow(string message)
    {
        const string marker = "row ";
        var start = message.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (start < 0) return null;
        start += marker.Length;
        var digits = new string(message[start..].TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, out var row) ? row : null;
    }

    private static string EntityTypeForCsv(string fileName) => fileName.ToLowerInvariant() switch
    {
        "questions.csv" => "Question",
        "answers.csv" => "Answer",
        "categories.csv" => "Category",
        "categorizations.csv" => "Categorization",
        "uploads.csv" => "Media",
        "users.csv" => "HistoricalUser",
        "passes.csv" => "LegacyPermission",
        _ => "Package"
    };
}
