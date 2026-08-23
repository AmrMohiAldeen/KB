using System.Globalization;
using System.Net;
using System.Net.Mail;

namespace Kb.Application.Migrations.HelpJuice;

public static class HelpJuiceUserCsvParser
{
    private const int MaximumHelpJuiceIdLength = 450;
    private const int MaximumNativeEmailLength = 320;
    private const string HelpJuiceUtcTimestampFormat = "yyyy-MM-dd HH:mm:ss 'UTC'";
    public static readonly IReadOnlyList<string> ExpectedHeaders =
    [
        "id", "first_name", "last_name", "job_title", "email", "notify_about_drafts",
        "notify_about_articles", "weekly_analytics_subscribed", "weekly_articles_subscribed",
        "sign_in_count", "current_sign_in_at", "last_sign_in_at", "current_sign_in_ip",
        "last_sign_in_ip", "created_at", "updated_at", "password_changed_at", "role_id",
        "deactivated_at"
    ];

    public static HelpJuiceUserCsvParseResult Parse(ParsedCsv csv, DateTime migrationAt)
    {
        var rows = csv.Rows.Select(row => ParseRow(row, migrationAt)).ToList();
        DiagnoseDuplicates(rows, csv.Rows);
        return new(rows);
    }

    private static ParsedHelpJuiceUser ParseRow(CsvRow row, DateTime migrationAt)
    {
        var diagnostics = new List<HelpJuiceUserParseDiagnostic>();
        var id = Text(row["id"]);
        if (id is null)
        {
            diagnostics.Add(Error("HELPJUICE_USER_ID_REQUIRED", "HelpJuice user id is required."));
            return new(row.RowNumber, null, false, diagnostics);
        }
        if (id.Length > MaximumHelpJuiceIdLength)
        {
            diagnostics.Add(Error("HELPJUICE_USER_ID_TOO_LONG",
                $"HelpJuice user id exceeds {MaximumHelpJuiceIdLength} characters."));
            return new(row.RowNumber, null, false, diagnostics);
        }

        var sourceEmail = Text(row["email"]);
        var validEmail = ValidEmail(sourceEmail);
        if (sourceEmail is null)
            diagnostics.Add(Warning("HELPJUICE_USER_EMAIL_MISSING",
                "Source email is blank; an existing HelpJuice ID can still receive metadata."));
        else if (validEmail is null)
            diagnostics.Add(Warning("HELPJUICE_USER_EMAIL_INVALID",
                "Source email is not valid for a native user; the raw value is retained as HelpJuice metadata."));

        var user = new ImportedHelpJuiceUser(
            id,
            Text(row["first_name"]),
            Text(row["last_name"]),
            Text(row["job_title"]),
            sourceEmail,
            validEmail,
            Boolean(row, "notify_about_drafts", diagnostics),
            Boolean(row, "notify_about_articles", diagnostics),
            Boolean(row, "weekly_analytics_subscribed", diagnostics),
            Boolean(row, "weekly_articles_subscribed", diagnostics),
            Integer(row, "sign_in_count", diagnostics),
            Timestamp(row, "current_sign_in_at", diagnostics),
            Timestamp(row, "last_sign_in_at", diagnostics),
            IpAddress(row, "current_sign_in_ip", diagnostics),
            IpAddress(row, "last_sign_in_ip", diagnostics),
            Timestamp(row, "created_at", diagnostics),
            Timestamp(row, "updated_at", diagnostics),
            Timestamp(row, "password_changed_at", diagnostics),
            Timestamp(row, "deactivated_at", diagnostics),
            Text(row["role_id"]),
            migrationAt);
        return new(row.RowNumber, user, true, diagnostics);
    }

    private static void DiagnoseDuplicates(List<ParsedHelpJuiceUser> rows, IReadOnlyList<CsvRow> sourceRows)
    {
        var ids = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var emails = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var source = sourceRows[index];
            var diagnostics = row.Diagnostics.ToList();
            var canWrite = row.CanWrite;
            var id = Text(source["id"]);
            if (id is not null && !ids.TryAdd(id, row.RowNumber))
            {
                diagnostics.Add(Error("HELPJUICE_USER_ID_DUPLICATE",
                    $"HelpJuice user id duplicates the value first seen on row {ids[id]}."));
                canWrite = false;
            }
            var email = Text(source["email"]);
            if (email is not null && !emails.TryAdd(email, row.RowNumber))
            {
                diagnostics.Add(Error("HELPJUICE_USER_EMAIL_DUPLICATE",
                    $"Source email duplicates the value first seen on row {emails[email]}."));
                canWrite = false;
            }
            rows[index] = row with { CanWrite = canWrite, Diagnostics = diagnostics };
        }
    }

    private static bool? Boolean(CsvRow row, string field,
        ICollection<HelpJuiceUserParseDiagnostic> diagnostics)
    {
        var value = Text(row[field]);
        if (value is null) return null;
        if (value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("yes", StringComparison.OrdinalIgnoreCase) || value == "1") return true;
        if (value.Equals("false", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("no", StringComparison.OrdinalIgnoreCase) || value == "0") return false;
        diagnostics.Add(Warning("HELPJUICE_USER_BOOLEAN_INVALID",
            $"Field '{field}' has malformed boolean value '{value}' and was retained as null."));
        return null;
    }

    private static int? Integer(CsvRow row, string field,
        ICollection<HelpJuiceUserParseDiagnostic> diagnostics)
    {
        var value = Text(row[field]);
        if (value is null) return null;
        if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)) return parsed;
        diagnostics.Add(Warning("HELPJUICE_USER_INTEGER_INVALID",
            $"Field '{field}' has malformed integer value '{value}' and was retained as null."));
        return null;
    }

    private static DateTime? Timestamp(CsvRow row, string field,
        ICollection<HelpJuiceUserParseDiagnostic> diagnostics)
    {
        var value = Text(row[field]);
        if (value is null) return null;
        if (DateTimeOffset.TryParseExact(value, HelpJuiceUtcTimestampFormat,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var helpJuiceTimestamp))
            return helpJuiceTimestamp.UtcDateTime;
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
            return parsed.UtcDateTime;
        diagnostics.Add(Warning("HELPJUICE_USER_TIMESTAMP_INVALID",
            $"Field '{field}' has malformed timestamp value '{value}' and was retained as null."));
        return null;
    }

    private static string? IpAddress(CsvRow row, string field,
        ICollection<HelpJuiceUserParseDiagnostic> diagnostics)
    {
        var value = Text(row[field]);
        if (value is null) return null;
        if (value.Length <= 45 && IPAddress.TryParse(value, out _)) return value;
        diagnostics.Add(Warning("HELPJUICE_USER_IP_INVALID",
            $"Field '{field}' has malformed IP address value '{value}' and was retained as null."));
        return null;
    }

    private static string? ValidEmail(string? value)
    {
        if (value is null || value.Length > MaximumNativeEmailLength ||
            !MailAddress.TryCreate(value, out var parsed)) return null;
        return parsed.Address.Equals(value, StringComparison.OrdinalIgnoreCase) ? value : null;
    }

    private static string? Text(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    private static HelpJuiceUserParseDiagnostic Error(string code, string message) =>
        new("Error", code, message);
    private static HelpJuiceUserParseDiagnostic Warning(string code, string message) =>
        new("Warning", code, message);
}
