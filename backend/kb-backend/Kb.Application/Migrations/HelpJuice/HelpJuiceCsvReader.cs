using System.Text;

namespace Kb.Application.Migrations.HelpJuice;

public static class HelpJuiceCsvReader
{
    public static async Task<ParsedCsv> ReadAsync(string path, int maximumRows,
        CancellationToken cancellationToken = default)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
            64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        using var reader = new StreamReader(stream, new UTF8Encoding(false, true), true, 64 * 1024);
        var rawRows = await TokenizeAsync(reader, maximumRows + 1, cancellationToken);
        if (rawRows.Count == 0)
            throw new InvalidDataException($"{Path.GetFileName(path)} must include a header row.");

        var headers = rawRows[0].Fields.Select((value, index) =>
            index == 0 ? value.Trim().TrimStart('\uFEFF') : value.Trim()).ToArray();
        if (headers.Any(string.IsNullOrWhiteSpace))
            throw new InvalidDataException($"{Path.GetFileName(path)} contains an empty column name.");
        if (headers.Distinct(StringComparer.OrdinalIgnoreCase).Count() != headers.Length)
            throw new InvalidDataException($"{Path.GetFileName(path)} contains duplicate column names.");

        var rows = new List<CsvRow>(Math.Min(rawRows.Count - 1, maximumRows));
        foreach (var row in rawRows.Skip(1))
        {
            if (row.Fields.All(string.IsNullOrWhiteSpace)) continue;
            if (rows.Count >= maximumRows)
                throw new InvalidDataException($"{Path.GetFileName(path)} exceeds the configured row limit.");
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < headers.Length; i++) values[headers[i]] = i < row.Fields.Count ? row.Fields[i] : string.Empty;
            rows.Add(new(row.RowNumber, values));
        }
        return new(Path.GetFileName(path), headers, rows);
    }

    private static async Task<List<RawRow>> TokenizeAsync(TextReader reader, int maximumRows,
        CancellationToken cancellationToken)
    {
        var rows = new List<RawRow>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var quoteClosed = false;
        var line = 1;
        var rowStart = 1;
        var buffer = new char[8192];
        var pending = new Queue<char>();

        async ValueTask<int> NextAsync()
        {
            if (pending.Count > 0) return pending.Dequeue();
            var read = await reader.ReadAsync(buffer.AsMemory(), cancellationToken);
            if (read == 0) return -1;
            for (var i = 1; i < read; i++) pending.Enqueue(buffer[i]);
            return buffer[0];
        }

        int? pushedBack = null;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var current = pushedBack ?? await NextAsync();
            pushedBack = null;
            if (current < 0) break;
            var ch = (char)current;
            if (inQuotes)
            {
                if (ch == '"')
                {
                    var next = await NextAsync();
                    if (next == '"') field.Append('"');
                    else { inQuotes = false; quoteClosed = true; pushedBack = next; }
                }
                else
                {
                    field.Append(ch);
                    if (ch == '\n') line++;
                }
                continue;
            }
            if (ch == '"' && field.Length == 0 && !quoteClosed) { inQuotes = true; continue; }
            if (quoteClosed && ch is not ',' and not '\r' and not '\n')
            {
                if (!char.IsWhiteSpace(ch))
                    throw new InvalidDataException($"Malformed CSV near row {rowStart}: text follows a closing quote.");
                continue;
            }
            if (ch == ',') { fields.Add(field.ToString()); field.Clear(); quoteClosed = false; continue; }
            if (ch is '\r' or '\n')
            {
                if (ch == '\r')
                {
                    var next = await NextAsync();
                    if (next != '\n') pushedBack = next;
                }
                fields.Add(field.ToString()); field.Clear(); quoteClosed = false;
                rows.Add(new(rowStart, fields.ToArray())); fields.Clear();
                if (rows.Count > maximumRows) throw new InvalidDataException("CSV exceeds the configured row limit.");
                line++; rowStart = line;
                continue;
            }
            if (ch == '"') throw new InvalidDataException($"Malformed CSV near row {rowStart}: quote in an unquoted field.");
            field.Append(ch);
        }
        if (inQuotes) throw new InvalidDataException($"Malformed CSV near row {rowStart}: unclosed quoted field.");
        if (field.Length > 0 || fields.Count > 0)
        {
            fields.Add(field.ToString());
            rows.Add(new(rowStart, fields.ToArray()));
        }
        return rows;
    }

    private sealed record RawRow(int RowNumber, IReadOnlyList<string> Fields);
}
