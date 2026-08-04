using System.IO.Compression;

namespace Kb.Application.Migrations.HelpJuice;

public static class HelpJuicePackageReader
{
    private static readonly HashSet<string> KnownCsv = new(StringComparer.OrdinalIgnoreCase)
    {
        "questions.csv", "answers.csv", "categories.csv", "categorizations.csv", "uploads.csv",
        "groups.csv", "passes.csv", "users.csv"
    };

    private static readonly HashSet<string> MediaExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff",
        ".pdf", ".mp4", ".mov", ".webm", ".avi", ".mpeg", ".mpg",
        ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".doc", ".xls", ".ppt",
        ".rtf", ".txt", ".md", ".json", ".xml"
    };

    public static bool IsSupportedManualFile(string fileName) =>
        KnownCsv.Contains(Path.GetFileName(fileName)) || MediaExtensions.Contains(Path.GetExtension(fileName));

    public static async Task<PackageContents> ExtractAsync(Stream package, HelpJuiceMigrationLimits limits,
        CancellationToken cancellationToken = default)
    {
        var root = Path.Combine(Path.GetTempPath(), "kb-helpjuice", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            Stream archiveStream = package;
            MemoryStream? buffered = null;
            if (!package.CanSeek)
            {
                buffered = new();
                await CopyLimitedAsync(package, buffered, limits.MaxPackageSizeBytes, cancellationToken);
                buffered.Position = 0;
                archiveStream = buffered;
            }
            using (buffered)
            using (var archive = new ZipArchive(archiveStream, ZipArchiveMode.Read, leaveOpen: true))
            {
                if (archive.Entries.Count > limits.MaxEntries)
                    throw new InvalidDataException("The ZIP contains too many entries.");
                long totalExtracted = 0;
                var known = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var media = new List<string>();
                var available = new List<string>();
                var unsupported = new List<string>();

                foreach (var entry in archive.Entries)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (string.IsNullOrEmpty(entry.Name)) continue;
                    var normalized = ValidateEntryName(entry.FullName);
                    available.Add(normalized);
                    if (entry.Length > limits.MaxEntrySizeBytes)
                        throw new InvalidDataException($"ZIP entry '{entry.Name}' exceeds the configured entry limit.");
                    totalExtracted = checked(totalExtracted + entry.Length);
                    if (totalExtracted > limits.MaxExtractedSizeBytes)
                        throw new InvalidDataException("The ZIP exceeds the configured extracted-size limit.");
                    if (entry.CompressedLength == 0 && entry.Length > 0 ||
                        entry.CompressedLength > 0 && entry.Length / entry.CompressedLength > limits.MaxCompressionRatio)
                        throw new InvalidDataException($"ZIP entry '{entry.Name}' has an unsafe compression ratio.");

                    var baseName = Path.GetFileName(normalized);
                    var isKnown = KnownCsv.Contains(baseName);
                    var isMedia = MediaExtensions.Contains(Path.GetExtension(baseName));
                    if (!isKnown && !isMedia) { unsupported.Add(normalized); continue; }
                    if (isKnown && known.ContainsKey(baseName))
                        throw new InvalidDataException($"The ZIP contains more than one {baseName} file.");

                    var destination = Path.GetFullPath(Path.Combine(root, normalized.Replace('/', Path.DirectorySeparatorChar)));
                    var rootPrefix = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
                    if (!destination.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("The ZIP contains a path-traversal entry.");
                    Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                    await using var source = entry.Open();
                    await using var target = new FileStream(destination, FileMode.CreateNew, FileAccess.Write,
                        FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                    await CopyLimitedAsync(source, target, limits.MaxEntrySizeBytes, cancellationToken);
                    if (isKnown) known[baseName] = destination;
                    else media.Add(destination);
                }
                return new(root, known, media, available, unsupported);
            }
        }
        catch
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
            throw;
        }
    }

    public static string ValidateEntryName(string value)
    {
        var normalized = value.Replace('\\', '/');
        if (string.IsNullOrWhiteSpace(normalized) || normalized.StartsWith('/') ||
            Path.IsPathRooted(normalized) || normalized.Any(char.IsControl) ||
            normalized.Split('/').Any(segment => segment is "" or "." or ".."))
            throw new InvalidDataException("The ZIP contains an unsafe path.");
        return string.Join('/', normalized.Split('/').Select(SanitizeSegment));
    }

    private static string SanitizeSegment(string segment)
    {
        var safe = new string(segment.Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch).ToArray());
        if (safe is "" or "." or "..") throw new InvalidDataException("The ZIP contains an unsafe filename.");
        return safe.Length <= 180 ? safe : safe[..180];
    }

    private static async Task CopyLimitedAsync(Stream source, Stream target, long maximum,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[64 * 1024];
        long copied = 0;
        while (true)
        {
            var read = await source.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            copied = checked(copied + read);
            if (copied > maximum) throw new InvalidDataException("Uploaded content exceeds the configured limit.");
            await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }
}
