using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Drafts;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kb.Application.Translations;

public sealed class LocalizationSynchronizationService(
    ILocalizationSynchronizationRepository repository,
    IProtectedTranslationTermRepository protectedTerms,
    ITranslationProvider provider,
    IObjectStorage storage,
    ICurrentUser currentUser,
    IPermissionChecker permissions,
    TimeProvider timeProvider,
    ILogger<LocalizationSynchronizationService> logger,
    IOptions<DraftContentOptions> draftOptions)
{
    private readonly DraftContentOptions options = draftOptions.Value;

    public async Task<LocalizationSyncPreviewData> PreviewAsync(Guid sourceArticleId,
        LocalizationSyncRequestData request, CancellationToken ct)
    {
        await RequireAsync(ct);
        Validate(sourceArticleId, request);
        var plan = await repository.GetPlanAsync(sourceArticleId, request.TargetLocaleCodes, ct);
        return ToPreview(plan, request);
    }

    public async Task<LocalizationSyncResultData> SynchronizeAsync(Guid sourceArticleId,
        LocalizationSyncRequestData request, CancellationToken ct)
    {
        await RequireAsync(ct);
        Validate(sourceArticleId, request);
        if (string.IsNullOrWhiteSpace(options.ContainerName) || options.MaxContentSizeBytes <= 0)
            throw new InvalidOperationException("Draft content storage is not configured.");

        var plan = await repository.GetPlanAsync(sourceArticleId, request.TargetLocaleCodes, ct);
        var preview = ToPreview(plan, request);
        var sourceContent = string.IsNullOrWhiteSpace(plan.Source.SourceContentJsonPath)
            ? "{\"type\":\"doc\",\"content\":[]}"
            : await DownloadAsync(plan.Source.SourceContentJsonPath, ct);
        var outcomes = new List<LocalizationSyncOutcomeData>(preview.Items.Count);
        foreach (var item in preview.Items)
        {
            if (item.Operation == LocalizationSyncOperations.Skip)
            {
                outcomes.Add(new(item.TargetLocaleCode, item.TargetArticleId, item.Operation,
                    "Skipped", null, null, null));
                continue;
            }

            string? stagedPath = null;
            try
            {
                var generated = await GenerateAsync(plan.Source, item.TargetLocaleCode, request.Mode,
                    sourceContent, ct);
                var bytes = Encoding.UTF8.GetBytes(generated.ContentJson);
                ValidateDocument(bytes);
                var mediaIds = ExtractMediaIds(generated.ContentJson);
                var objectName = $"articles/sync-staging/{sourceArticleId:N}/{Guid.NewGuid():N}/content.json";
                await using (var stream = new MemoryStream(bytes, writable: false))
                    stagedPath = await storage.UploadAsync(options.ContainerName, objectName, stream,
                        "application/json", ct);
                if (string.IsNullOrWhiteSpace(stagedPath))
                    throw new ExternalServiceException("Object storage returned an empty object identifier.");

                var target = plan.Targets.Single(x => x.TargetLocaleCode == item.TargetLocaleCode);
                var automatic = request.Mode == LocalizationSyncModes.AutomaticTranslation;
                var committed = await repository.CommitAsync(new(plan.Source, item.TargetLocaleCode,
                    target.TargetArticleId, target.TargetCurrentDraftId, target.TargetDraftRowVersion,
                    item.Operation, generated.Title, stagedPath,
                    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), bytes.LongLength, mediaIds,
                    automatic ? ArticleTranslationMethods.Automatic : ArticleTranslationMethods.Copied,
                    automatic ? ArticleTranslationStatuses.NeedsVerification : ArticleTranslationStatuses.NeedsTranslation,
                    automatic ? provider.Name : null, generated.SegmentCount, currentUser.UserId,
                    timeProvider.GetUtcNow().UtcDateTime), ct);
                outcomes.Add(new(item.TargetLocaleCode, committed.TargetArticleId, item.Operation,
                    "Succeeded", committed.TargetDraftId, committed.TranslationStatus, null));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception exception)
            {
                if (!string.IsNullOrWhiteSpace(stagedPath)) await DeleteBestEffortAsync(stagedPath);
                logger.LogWarning("Localization synchronization failed for source {SourceArticleId}, target " +
                    "locale {TargetLocaleCode}, operation {Operation}. Failure: {FailureType}",
                    sourceArticleId, item.TargetLocaleCode, item.Operation, exception.GetType().Name);
                outcomes.Add(new(item.TargetLocaleCode, item.TargetArticleId, item.Operation,
                    "Failed", null, null, exception.Message));
            }
        }
        return new(sourceArticleId, plan.Source.SourceVersionId, plan.Source.SourceVersionNumber, outcomes);
    }

    private async Task<(string Title, string ContentJson, int SegmentCount)> GenerateAsync(
        LocalizationSyncSourceSnapshot source, string targetLocaleCode, string mode, string sourceContent,
        CancellationToken ct)
    {
        if (mode == LocalizationSyncModes.CopySource)
            return (source.SourceTitle, sourceContent, 0);
        var terms = await protectedTerms.GetEnabledAsync(targetLocaleCode, ct);
        var translated = await new TiptapTranslationProcessor(provider).TranslateAsync(source.SourceTitle,
            sourceContent, source.SourceLocaleCode, targetLocaleCode, terms, ct);
        if (string.IsNullOrWhiteSpace(translated.Title) || translated.Title.Length > 300)
            throw new BusinessRuleException("The translated article title must contain between 1 and 300 characters.");
        return (translated.Title, translated.ContentJson, translated.TranslatedSegmentCount);
    }

    private LocalizationSyncPreviewData ToPreview(LocalizationSyncPlan plan, LocalizationSyncRequestData request) =>
        new(plan.Source.SourceArticleId, plan.Source.SourceLocaleCode, plan.Source.SourceVersionId,
            plan.Source.SourceVersionNumber, request.Scope, request.Mode,
            plan.Targets.Select(target =>
            {
                var operation = Operation(target.State, request.Scope, request.Mode);
                return new LocalizationSyncPreviewItemData(target.TargetLocaleCode, target.TargetArticleId,
                    target.State, operation, operation is LocalizationSyncOperations.UpdateCopy or
                        LocalizationSyncOperations.UpdateAutomaticTranslation);
            }).ToArray());

    private static string Operation(string state, string scope, string mode)
    {
        if (state == LocalizationSyncStates.Missing && scope == LocalizationSyncScopes.MissingOnly)
            return mode == LocalizationSyncModes.AutomaticTranslation
                ? LocalizationSyncOperations.CreateAutomaticTranslation : LocalizationSyncOperations.CreateCopy;
        if (state != LocalizationSyncStates.Missing && scope == LocalizationSyncScopes.UpdateExisting)
            return mode == LocalizationSyncModes.AutomaticTranslation
                ? LocalizationSyncOperations.UpdateAutomaticTranslation : LocalizationSyncOperations.UpdateCopy;
        return LocalizationSyncOperations.Skip;
    }

    private static void Validate(Guid sourceArticleId, LocalizationSyncRequestData request)
    {
        if (sourceArticleId == Guid.Empty) throw new BusinessRuleException("The source article is required.");
        if (request.TargetLocaleCodes.Count is < 1 or > 50)
            throw new BusinessRuleException("Select between 1 and 50 target languages.");
        if (request.TargetLocaleCodes.Any(string.IsNullOrWhiteSpace) ||
            request.TargetLocaleCodes.Distinct(StringComparer.OrdinalIgnoreCase).Count() != request.TargetLocaleCodes.Count)
            throw new BusinessRuleException("Target languages must be non-empty and unique.");
        if (request.Scope is not (LocalizationSyncScopes.MissingOnly or LocalizationSyncScopes.UpdateExisting))
            throw new BusinessRuleException("Synchronization scope is invalid.");
        if (request.Mode is not (LocalizationSyncModes.CopySource or LocalizationSyncModes.AutomaticTranslation))
            throw new BusinessRuleException("Synchronization mode is invalid.");
    }

    private async Task RequireAsync(CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (!await permissions.HasPermissionAsync(currentUser.UserId, PermissionCodes.ArticlesTranslate, ct))
            throw new ForbiddenException("You do not have permission to synchronize article translations.");
    }

    private async Task<string> DownloadAsync(string path, CancellationToken ct)
    {
        try
        {
            await using var source = await storage.DownloadAsync(options.ContainerName, path, ct);
            using var destination = new MemoryStream();
            await source.CopyToAsync(destination, ct);
            if (destination.Length > options.MaxContentSizeBytes)
                throw new BusinessRuleException("Stored Tiptap JSON exceeds the configured draft size limit.");
            return Encoding.UTF8.GetString(destination.ToArray());
        }
        catch (OperationCanceledException) { throw; }
        catch (BusinessRuleException) { throw; }
        catch (Exception exception) { throw new ExternalServiceException("Saved source draft content could not be loaded.", exception); }
    }

    private void ValidateDocument(byte[] bytes)
    {
        if (bytes.LongLength > options.MaxContentSizeBytes)
            throw new BusinessRuleException($"Synchronized Tiptap JSON cannot exceed {options.MaxContentSizeBytes} bytes.");
        using var document = JsonDocument.Parse(bytes);
        if (!document.RootElement.TryGetProperty("type", out var type) || type.GetString() != "doc")
            throw new BusinessRuleException("Synchronized content is not a Tiptap document.");
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
                var media = value.TryGetProperty("type", out var type) && type.GetString() is
                    "image" or "inlineImage" or "video" or "attachment";
                if (media && value.TryGetProperty("attrs", out var attrs) &&
                    attrs.TryGetProperty("mediaId", out var id) && Guid.TryParse(id.GetString(), out var parsed))
                    result.Add(parsed);
                foreach (var property in value.EnumerateObject()) Visit(property.Value);
            }
            else if (value.ValueKind == JsonValueKind.Array)
                foreach (var item in value.EnumerateArray()) Visit(item);
        }
    }

    private async Task DeleteBestEffortAsync(string path)
    { try { await storage.DeleteAsync(options.ContainerName, path, CancellationToken.None); } catch { } }
}
