using System.Text;
using Kb.Application.Exceptions;

namespace Kb.Application.Media;

internal sealed record InspectedMedia(string ContentType, string Extension, MediaKind Kind, Stream UploadStream);

internal static class MediaFileInspector
{
    private const int PrefixSize = 512;

    private sealed record Format(string MimeType, MediaKind Kind, SignatureFamily Signature);

    private enum SignatureFamily
    {
        Jpeg, Png, Gif, Webp, Bmp, Tiff, Pdf, Mp4, Webm, Avi, Mpeg, Zip, Ole, Rtf, Text
    }

    private static readonly IReadOnlyDictionary<string, Format> Formats =
        new Dictionary<string, Format>(StringComparer.OrdinalIgnoreCase)
        {
            [".jpg"] = new("image/jpeg", MediaKind.Image, SignatureFamily.Jpeg),
            [".jpeg"] = new("image/jpeg", MediaKind.Image, SignatureFamily.Jpeg),
            [".png"] = new("image/png", MediaKind.Image, SignatureFamily.Png),
            [".gif"] = new("image/gif", MediaKind.Gif, SignatureFamily.Gif),
            [".webp"] = new("image/webp", MediaKind.Image, SignatureFamily.Webp),
            [".bmp"] = new("image/bmp", MediaKind.Image, SignatureFamily.Bmp),
            [".tif"] = new("image/tiff", MediaKind.Image, SignatureFamily.Tiff),
            [".tiff"] = new("image/tiff", MediaKind.Image, SignatureFamily.Tiff),
            [".pdf"] = new("application/pdf", MediaKind.Pdf, SignatureFamily.Pdf),
            [".mp4"] = new("video/mp4", MediaKind.Video, SignatureFamily.Mp4),
            [".mov"] = new("video/quicktime", MediaKind.Video, SignatureFamily.Mp4),
            [".webm"] = new("video/webm", MediaKind.Video, SignatureFamily.Webm),
            [".avi"] = new("video/x-msvideo", MediaKind.Video, SignatureFamily.Avi),
            [".mpeg"] = new("video/mpeg", MediaKind.Video, SignatureFamily.Mpeg),
            [".mpg"] = new("video/mpeg", MediaKind.Video, SignatureFamily.Mpeg),
            [".docx"] = new("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                MediaKind.Document, SignatureFamily.Zip),
            [".xlsx"] = new("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                MediaKind.Document, SignatureFamily.Zip),
            [".pptx"] = new("application/vnd.openxmlformats-officedocument.presentationml.presentation",
                MediaKind.Document, SignatureFamily.Zip),
            [".odt"] = new("application/vnd.oasis.opendocument.text", MediaKind.Document, SignatureFamily.Zip),
            [".ods"] = new("application/vnd.oasis.opendocument.spreadsheet", MediaKind.Document, SignatureFamily.Zip),
            [".odp"] = new("application/vnd.oasis.opendocument.presentation", MediaKind.Document, SignatureFamily.Zip),
            [".doc"] = new("application/msword", MediaKind.Document, SignatureFamily.Ole),
            [".xls"] = new("application/vnd.ms-excel", MediaKind.Document, SignatureFamily.Ole),
            [".ppt"] = new("application/vnd.ms-powerpoint", MediaKind.Document, SignatureFamily.Ole),
            [".rtf"] = new("application/rtf", MediaKind.Document, SignatureFamily.Rtf),
            [".txt"] = new("text/plain", MediaKind.Document, SignatureFamily.Text),
            [".md"] = new("text/markdown", MediaKind.Document, SignatureFamily.Text),
            [".csv"] = new("text/csv", MediaKind.Document, SignatureFamily.Text),
            [".json"] = new("application/json", MediaKind.Document, SignatureFamily.Text),
            [".xml"] = new("application/xml", MediaKind.Document, SignatureFamily.Text)
        };

    public static async Task<InspectedMedia> InspectAsync(MediaUploadCommand command, long maximumSize,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command.Content);
        if (!command.Content.CanRead)
            throw new BusinessRuleException("The uploaded file stream is not readable.");
        if (command.FileSizeBytes <= 0)
            throw new BusinessRuleException("The uploaded file is empty.");
        if (command.FileSizeBytes > maximumSize)
            throw new BusinessRuleException($"The uploaded file cannot exceed {maximumSize} bytes.");

        var fileName = ValidateFileName(command.OriginalFileName);
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!Formats.TryGetValue(extension, out var expected))
            throw new BusinessRuleException("The uploaded file extension is not supported.");

        var clientType = NormalizeContentType(command.ClientContentType);
        if (clientType is not null && clientType != "application/octet-stream" &&
            !IsCompatibleClientType(clientType, expected.MimeType, extension))
            throw new BusinessRuleException("The uploaded MIME type does not match the file extension.");

        var initialPosition = command.Content.CanSeek ? command.Content.Position : 0;
        var prefix = new byte[(int)Math.Min(PrefixSize, command.FileSizeBytes)];
        var length = 0;
        while (length < prefix.Length)
        {
            var read = await command.Content.ReadAsync(prefix.AsMemory(length), cancellationToken);
            if (read == 0) break;
            length += read;
        }
        if (length == 0)
            throw new BusinessRuleException("The uploaded file is empty.");

        var bytes = prefix.AsSpan(0, length);
        if (!MatchesSignature(bytes, expected.Signature))
            throw new BusinessRuleException("The uploaded file content does not match its declared format.");

        Stream uploadStream;
        if (command.Content.CanSeek)
        {
            command.Content.Position = initialPosition;
            uploadStream = command.Content;
        }
        else
        {
            uploadStream = new PrefixReplayStream(prefix.AsMemory(0, length), command.Content);
        }

        return new(expected.MimeType, extension, expected.Kind, uploadStream);
    }

    public static MediaKind? ParseKind(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return Enum.TryParse<MediaKind>(value.Trim(), true, out var kind)
            ? kind
            : throw new BusinessRuleException("Media type must be image, gif, video, pdf, or document.");
    }

    public static MediaKind KindFromMimeType(string mimeType) =>
        mimeType.Equals("image/gif", StringComparison.OrdinalIgnoreCase) ? MediaKind.Gif :
        mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? MediaKind.Image :
        mimeType.StartsWith("video/", StringComparison.OrdinalIgnoreCase) ? MediaKind.Video :
        mimeType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase) ? MediaKind.Pdf :
        MediaKind.Document;

    private static string ValidateFileName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new BusinessRuleException("A filename is required.");
        var name = value.Trim();
        if (name.Length > 260 || name is "." or ".." ||
            name.IndexOfAny([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar, ':']) >= 0 ||
            name.Any(char.IsControl) || !string.Equals(Path.GetFileName(name), name, StringComparison.Ordinal))
            throw new BusinessRuleException("The uploaded filename is invalid.");
        return name;
    }

    private static string? NormalizeContentType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var mediaType = value.Split(';', 2)[0].Trim().ToLowerInvariant();
        if (mediaType.Length > 150 || !mediaType.Contains('/'))
            throw new BusinessRuleException("The uploaded MIME type is invalid.");
        return mediaType;
    }

    private static bool IsCompatibleClientType(string actual, string expected, string extension) =>
        actual.Equals(expected, StringComparison.OrdinalIgnoreCase) ||
        extension is ".jpg" or ".jpeg" && actual == "image/jpg" ||
        extension == ".csv" && actual is "application/csv" or "application/vnd.ms-excel" ||
        extension == ".rtf" && actual == "text/rtf" ||
        extension == ".xml" && actual == "text/xml" ||
        extension == ".json" && actual == "text/json";

    private static bool MatchesSignature(ReadOnlySpan<byte> bytes, SignatureFamily family) => family switch
    {
        SignatureFamily.Jpeg => StartsWith(bytes, [0xFF, 0xD8, 0xFF]),
        SignatureFamily.Png => StartsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        SignatureFamily.Gif => StartsWithAscii(bytes, "GIF87a") || StartsWithAscii(bytes, "GIF89a"),
        SignatureFamily.Webp => bytes.Length >= 12 && StartsWithAscii(bytes, "RIFF") &&
                                Encoding.ASCII.GetString(bytes.Slice(8, 4)) == "WEBP",
        SignatureFamily.Bmp => StartsWithAscii(bytes, "BM"),
        SignatureFamily.Tiff => StartsWith(bytes, [0x49, 0x49, 0x2A, 0x00]) ||
                                StartsWith(bytes, [0x4D, 0x4D, 0x00, 0x2A]),
        SignatureFamily.Pdf => StartsWithAscii(bytes, "%PDF-"),
        SignatureFamily.Mp4 => bytes.Length >= 12 && Encoding.ASCII.GetString(bytes.Slice(4, 4)) == "ftyp",
        SignatureFamily.Webm => StartsWith(bytes, [0x1A, 0x45, 0xDF, 0xA3]),
        SignatureFamily.Avi => bytes.Length >= 12 && StartsWithAscii(bytes, "RIFF") &&
                               Encoding.ASCII.GetString(bytes.Slice(8, 4)) == "AVI ",
        SignatureFamily.Mpeg => StartsWith(bytes, [0x00, 0x00, 0x01, 0xBA]) ||
                                StartsWith(bytes, [0x00, 0x00, 0x01, 0xB3]),
        SignatureFamily.Zip => StartsWith(bytes, [0x50, 0x4B, 0x03, 0x04]) ||
                               StartsWith(bytes, [0x50, 0x4B, 0x05, 0x06]) ||
                               StartsWith(bytes, [0x50, 0x4B, 0x07, 0x08]),
        SignatureFamily.Ole => StartsWith(bytes, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]),
        SignatureFamily.Rtf => StartsWithAscii(bytes, @"{\rtf"),
        SignatureFamily.Text => LooksLikeText(bytes),
        _ => false
    };

    private static bool StartsWith(ReadOnlySpan<byte> value, ReadOnlySpan<byte> prefix) =>
        value.StartsWith(prefix);

    private static bool StartsWithAscii(ReadOnlySpan<byte> value, string prefix) =>
        value.StartsWith(Encoding.ASCII.GetBytes(prefix));

    private static bool LooksLikeText(ReadOnlySpan<byte> bytes)
    {
        if (bytes.IndexOf((byte)0) >= 0) return false;
        try
        {
            _ = new UTF8Encoding(false, true).GetString(bytes);
            return true;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }

    private sealed class PrefixReplayStream(ReadOnlyMemory<byte> prefix, Stream remainder) : Stream
    {
        private int position;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) =>
            ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            if (position < prefix.Length)
            {
                var count = Math.Min(buffer.Length, prefix.Length - position);
                prefix.Slice(position, count).CopyTo(buffer);
                position += count;
                return count;
            }
            return await remainder.ReadAsync(buffer, cancellationToken);
        }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
