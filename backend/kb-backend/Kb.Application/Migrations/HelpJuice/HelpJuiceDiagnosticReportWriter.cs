using System.Text;

namespace Kb.Application.Migrations.HelpJuice;

public static class HelpJuiceDiagnosticReportWriter
{
    public static async Task WriteAsync(string path, string sourcePackage, DateTime startedAt, DateTime completedAt,
        IReadOnlyDictionary<string, int> recordsByFile, int packagedMediaCount, HelpJuiceSource? source,
        IReadOnlyList<MigrationIssueData> issues, bool scanFailed, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None,
            64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

        await WriteRow(writer, cancellationToken, "Section", "Severity", "Source file", "Source row",
            "Source ID", "Entity type", "Entity title/name", "Issue type", "Existing validation/error message",
            "Additional parser context", "Would block import", "Count");

        var totalRecords = recordsByFile.Values.Sum() + packagedMediaCount;
        var errorCount = issues.Count(issue => issue.Severity.Equals("Error", StringComparison.OrdinalIgnoreCase));
        var warningCount = issues.Count(issue => issue.Severity.Equals("Warning", StringComparison.OrdinalIgnoreCase));
        await WriteSummary(writer, cancellationToken, "Scan status", scanFailed ? "Partial - scan failure recorded below" : "Completed");
        await WriteSummary(writer, cancellationToken, "Source package", sourcePackage);
        await WriteSummary(writer, cancellationToken, "Started (UTC)", startedAt.ToString("O"));
        await WriteSummary(writer, cancellationToken, "Completed (UTC)", completedAt.ToString("O"));
        await WriteSummary(writer, cancellationToken, "Total records scanned", totalRecords.ToString());
        await WriteSummary(writer, cancellationToken, "Total errors", errorCount.ToString());
        await WriteSummary(writer, cancellationToken, "Total warnings", warningCount.ToString());
        foreach (var item in recordsByFile.OrderBy(item => item.Key, StringComparer.OrdinalIgnoreCase))
            await WriteSummary(writer, cancellationToken, $"Records scanned: {item.Key}", item.Value.ToString());
        if (packagedMediaCount > 0)
            await WriteSummary(writer, cancellationToken, "Packaged media files scanned", packagedMediaCount.ToString());

        var names = BuildEntityNames(source);
        foreach (var issue in issues)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var entityType = DisplayEntityType(issue.ExternalEntityType, issue.FileName);
            var entityName = FindEntityName(names, entityType, issue.ExternalId, issue.FileName, issue.RowNumber);
            await WriteRow(writer, cancellationToken, "Issue", issue.Severity, issue.FileName, issue.RowNumber,
                issue.ExternalId, entityType, entityName, issue.ErrorCode, issue.Message,
                issue.SourceDataSummary, issue.Severity.Equals("Error", StringComparison.OrdinalIgnoreCase) ? "Yes" : "No", 1);
        }

        foreach (var group in issues.GroupBy(issue => new { issue.Severity, issue.ErrorCode })
                     .OrderBy(group => group.Key.Severity).ThenBy(group => group.Key.ErrorCode))
            await WriteRow(writer, cancellationToken, "Summary by issue type", group.Key.Severity, null, null,
                null, null, null, group.Key.ErrorCode, null, null,
                group.Key.Severity.Equals("Error", StringComparison.OrdinalIgnoreCase) ? "Yes" : "No", group.Count());

        foreach (var group in issues.GroupBy(issue => new { issue.Severity, File = issue.FileName ?? "Package" })
                     .OrderBy(group => group.Key.File).ThenBy(group => group.Key.Severity))
            await WriteRow(writer, cancellationToken, "Summary by source CSV", group.Key.Severity, group.Key.File,
                null, null, null, null, null, null, null,
                group.Key.Severity.Equals("Error", StringComparison.OrdinalIgnoreCase) ? "Yes" : "No", group.Count());

        foreach (var group in issues.Where(issue => issue.ExternalId is not null || issue.RowNumber is not null)
                     .GroupBy(issue => DisplayEntityType(issue.ExternalEntityType, issue.FileName)))
        {
            var affected = group.Select(issue => issue.ExternalId is not null
                    ? $"id|{issue.ExternalId}"
                    : $"row|{issue.FileName}|{issue.RowNumber}")
                .Distinct(StringComparer.OrdinalIgnoreCase).Count();
            await WriteRow(writer, cancellationToken, "Affected entities", null, null, null, null, group.Key,
                null, null, null, null, null, affected);
        }

        await WriteSummary(writer, cancellationToken, "End: total records scanned", totalRecords.ToString());
        await WriteSummary(writer, cancellationToken, "End: total errors", errorCount.ToString());
        await WriteSummary(writer, cancellationToken, "End: total warnings", warningCount.ToString());
    }

    private static Dictionary<string, string> BuildEntityNames(HelpJuiceSource? source)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (source is null) return result;
        foreach (var question in source.Questions)
        {
            result[$"Article|id|{question.Id}"] = question.Name;
            result[$"Article|row|questions.csv|{question.RowNumber}"] = question.Name;
        }
        var questionNames = source.Questions.GroupBy(question => question.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().Name, StringComparer.OrdinalIgnoreCase);
        foreach (var answer in source.Answers)
        {
            var name = questionNames.GetValueOrDefault(answer.QuestionId);
            if (name is null) continue;
            result[$"Answer|id|{answer.Id}"] = name;
            result[$"Answer|row|answers.csv|{answer.RowNumber}"] = name;
        }
        foreach (var category in source.Categories)
        {
            result[$"Category|id|{category.Id}"] = category.Name;
            result[$"Category|row|categories.csv|{category.RowNumber}"] = category.Name;
        }
        foreach (var upload in source.Uploads ?? [])
        {
            result[$"Upload|id|{upload.Id}"] = upload.FileName;
            result[$"Upload|row|uploads.csv|{upload.RowNumber}"] = upload.FileName;
        }
        return result;
    }

    private static string DisplayEntityType(string? value, string? fileName) => value switch
    {
        "Question" => "Article",
        "Media" => "Upload",
        not null => value,
        _ => Path.GetFileName(fileName)?.ToLowerInvariant() switch
        {
            "questions.csv" => "Article",
            "answers.csv" => "Answer",
            "categories.csv" => "Category",
            "categorizations.csv" => "Categorization",
            "uploads.csv" => "Upload",
            "users.csv" => "User",
            _ => "Package"
        }
    };

    private static string? FindEntityName(IReadOnlyDictionary<string, string> names, string type, string? id,
        string? file, int? row)
    {
        if (id is not null && names.TryGetValue($"{type}|id|{id}", out var byId)) return byId;
        return row is not null && file is not null && names.TryGetValue($"{type}|row|{Path.GetFileName(file)}|{row}", out var byRow)
            ? byRow : null;
    }

    private static Task WriteSummary(StreamWriter writer, CancellationToken cancellationToken, string metric, string value) =>
        WriteRow(writer, cancellationToken, "Summary", null, null, null, null, null, null, metric, value,
            null, null, null);

    private static async Task WriteRow(StreamWriter writer, CancellationToken cancellationToken, params object?[] cells)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await writer.WriteLineAsync(string.Join(',', cells.Select(CsvCell)).AsMemory(), cancellationToken);
    }

    private static string CsvCell(object? value) => $"\"{Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture)?.Replace("\"", "\"\"") ?? string.Empty}\"";
}
