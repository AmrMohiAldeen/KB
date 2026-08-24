using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Microsoft.Extensions.Options;

namespace Kb.Application.Translations;

public sealed class AutomaticArticleTranslationService(
    IAutomaticArticleTranslationRepository repository,
    IProtectedTranslationTermRepository protectedTerms,
    ITranslationProvider provider,
    IObjectStorage storage,
    ICurrentUser currentUser,
    IPermissionChecker permissions,
    TimeProvider timeProvider,
    IOptions<DraftContentOptions> draftOptions)
{
    private static readonly string EmptyDocument = JsonSerializer.Serialize(new
        { type = "doc", content = Array.Empty<object>() });
    private readonly DraftContentOptions options = draftOptions.Value;

    public async Task<AutomaticArticleTranslationData> TranslateAsync(Guid sourceArticleId, Guid targetArticleId,
        CancellationToken ct)
    {
        await RequireAsync(ct);
        if (sourceArticleId == Guid.Empty || targetArticleId == Guid.Empty)
            throw new BusinessRuleException("Source and target article IDs are required.");
        if (sourceArticleId == targetArticleId)
            throw new BusinessRuleException("Source and target articles must be different.");
        if (string.IsNullOrWhiteSpace(options.ContainerName) || options.MaxContentSizeBytes <= 0)
            throw new InvalidOperationException("Draft content storage is not configured.");

        var snapshot = await repository.GetSnapshotAsync(sourceArticleId, targetArticleId, ct);
        var content = string.IsNullOrWhiteSpace(snapshot.SourceContentJsonPath)
            ? EmptyDocument
            : await DownloadAsync(snapshot.SourceContentJsonPath, ct);
        var terms = await protectedTerms.GetEnabledAsync(snapshot.TargetLocaleCode, ct);
        var processor = new TiptapTranslationProcessor(provider);
        var translated = await processor.TranslateAsync(snapshot.SourceTitle, content,
            snapshot.SourceLocaleCode, snapshot.TargetLocaleCode, terms, ct);
        if (string.IsNullOrWhiteSpace(translated.Title) || translated.Title.Length > 300)
            throw new BusinessRuleException("The translated article title must contain between 1 and 300 characters.");
        var bytes = Encoding.UTF8.GetBytes(translated.ContentJson);
        if (bytes.LongLength > options.MaxContentSizeBytes)
            throw new BusinessRuleException($"Translated Tiptap JSON cannot exceed {options.MaxContentSizeBytes} bytes.");
        using (var validation = JsonDocument.Parse(bytes))
            if (validation.RootElement.GetProperty("type").GetString() != "doc")
                throw new BusinessRuleException("Translated content is not a Tiptap document.");
        var mediaIds = ExtractMediaIds(translated.ContentJson);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var objectName = $"articles/{targetArticleId:N}/drafts/{snapshot.TargetDraftId:N}/{Guid.NewGuid():N}/content.json";
        string storedPath;
        try
        {
            await using var stream = new MemoryStream(bytes, writable: false);
            storedPath = await storage.UploadAsync(options.ContainerName, objectName, stream, "application/json", ct);
            if (string.IsNullOrWhiteSpace(storedPath))
                throw new InvalidOperationException("Object storage returned an empty object identifier.");
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception exception)
        { throw new ExternalServiceException("Translated draft content could not be staged.", exception); }

        AutomaticTranslationCommitResult committed;
        try
        {
            committed = await repository.CommitAsync(new(snapshot, translated.Title, storedPath,
                Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), bytes.LongLength, mediaIds,
                provider.Name, translated.TranslatedSegmentCount, currentUser.UserId, now), ct);
        }
        catch
        {
            await DeleteBestEffortAsync([storedPath]);
            throw;
        }

        await DeleteBestEffortAsync(new[]
        {
            snapshot.TargetContentJsonPath, snapshot.TargetRenderedHtmlPath, snapshot.TargetPlainTextPath
        }.Where(path => !string.IsNullOrWhiteSpace(path) &&
            !string.Equals(path, storedPath, StringComparison.Ordinal)).Select(path => path!));
        return new(sourceArticleId, committed.TargetArticleId, committed.TargetDraftId,
            snapshot.SourceLocaleCode, committed.TargetLocaleCode, committed.TranslatedTitle,
            translated.TranslatedSegmentCount, ArticleTranslationMethods.Automatic,
            ArticleTranslationStatuses.NeedsVerification, committed.TranslatedAt);
    }

    private async Task RequireAsync(CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (!await permissions.HasPermissionAsync(currentUser.UserId, PermissionCodes.ArticlesTranslate, ct))
            throw new ForbiddenException("You do not have permission to automatically translate articles.");
    }

    private async Task<string> DownloadAsync(string path, CancellationToken ct)
    {
        try
        {
            await using var source = await storage.DownloadAsync(options.ContainerName, path, ct);
            using var destination = new MemoryStream();
            var buffer = new byte[81920];
            while (true)
            {
                var read = await source.ReadAsync(buffer, ct);
                if (read == 0) break;
                if (destination.Length + read > options.MaxContentSizeBytes)
                    throw new BusinessRuleException("Stored Tiptap JSON exceeds the configured draft size limit.");
                await destination.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            return Encoding.UTF8.GetString(destination.ToArray());
        }
        catch (OperationCanceledException) { throw; }
        catch (BusinessRuleException) { throw; }
        catch (Exception exception)
        { throw new ExternalServiceException("Source content could not be loaded.", exception); }
    }

    private static IReadOnlyCollection<Guid> ExtractMediaIds(string contentJson)
    {
        using var document = JsonDocument.Parse(contentJson);
        var result = new HashSet<Guid>();
        Visit(document.RootElement);
        if (result.Count > 500) throw new BusinessRuleException("A draft cannot reference more than 500 media files.");
        return result;

        void Visit(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Object)
            {
                var isMedia = value.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String &&
                    type.GetString() is "image" or "inlineImage" or "video" or "attachment";
                if (isMedia && value.TryGetProperty("attrs", out var attrs) && attrs.ValueKind == JsonValueKind.Object &&
                    attrs.TryGetProperty("mediaId", out var mediaId) && mediaId.ValueKind == JsonValueKind.String &&
                    Guid.TryParse(mediaId.GetString(), out var parsed) && parsed != Guid.Empty)
                    result.Add(parsed);
                foreach (var property in value.EnumerateObject()) Visit(property.Value);
            }
            else if (value.ValueKind == JsonValueKind.Array)
                foreach (var item in value.EnumerateArray()) Visit(item);
        }
    }

    private async Task DeleteBestEffortAsync(IEnumerable<string> paths)
    {
        foreach (var path in paths.Distinct(StringComparer.Ordinal))
            try { await storage.DeleteAsync(options.ContainerName, path, CancellationToken.None); }
            catch { /* Immutable orphan blobs are handled by storage cleanup. */ }
    }
}
