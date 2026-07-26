using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Microsoft.Extensions.Options;

namespace Kb.Application.Drafts;

public sealed class ArticleDraftService
{
    private static readonly JsonElement EmptyDocument = CreateEmptyDocument();
    private readonly IArticleDraftRepository repository;
    private readonly IObjectStorage storage;
    private readonly ICurrentUser currentUser;
    private readonly IPermissionChecker permissionChecker;
    private readonly TimeProvider timeProvider;
    private readonly DraftContentOptions options;

    public ArticleDraftService(
        IArticleDraftRepository repository,
        IObjectStorage storage,
        ICurrentUser currentUser,
        IPermissionChecker permissionChecker,
        TimeProvider timeProvider,
        IOptions<DraftContentOptions> options)
    {
        this.repository = repository;
        this.storage = storage;
        this.currentUser = currentUser;
        this.permissionChecker = permissionChecker;
        this.timeProvider = timeProvider;
        this.options = options.Value;

        if (string.IsNullOrWhiteSpace(this.options.ContainerName))
            throw new InvalidOperationException("The article content storage container is not configured.");
        if (this.options.MaxContentSizeBytes <= 0)
            throw new InvalidOperationException("The draft content size limit must be greater than zero.");
    }

    public async Task<DraftViewData> GetAsync(Guid articleId, CancellationToken cancellationToken)
    {
        EnsureAuthenticated();
        var draft = await GetCurrentAsync(articleId, cancellationToken);
        var actorId = currentUser.UserId;
        var canEdit = await CanEditAsync(draft.ArticleOwnerId, actorId, cancellationToken);
        var isLockOwner = draft.IsLocked && draft.LockedBy?.Id == actorId;
        var content = string.IsNullOrWhiteSpace(draft.ContentJsonPath)
            ? EmptyDocument.Clone()
            : await DownloadContentAsync(draft.ContentJsonPath, cancellationToken);
        return new(draft, content, canEdit, isLockOwner);
    }

    public async Task<DraftLockData> AcquireLockAsync(Guid articleId, byte[] expectedRowVersion,
        CancellationToken cancellationToken)
    {
        EnsureExpectedRowVersion(expectedRowVersion);
        var draft = await GetCurrentAsync(articleId, cancellationToken);
        var actorId = currentUser.UserId;
        await RequireEditAsync(draft.ArticleOwnerId, actorId, cancellationToken);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var changed = await repository.AcquireLockAsync(articleId, draft.DraftId, actorId,
            expectedRowVersion, now, Audit(actorId, ArticleAuditActions.DraftLockAcquired,
                new { articleId, draftId = draft.DraftId }, now), cancellationToken);
        return new(changed, true, changed.LockedBy?.Id == actorId);
    }

    public async Task<DraftLockData> ReleaseLockAsync(Guid articleId, byte[] expectedRowVersion,
        CancellationToken cancellationToken)
    {
        EnsureExpectedRowVersion(expectedRowVersion);
        var draft = await GetCurrentAsync(articleId, cancellationToken);
        var actorId = currentUser.UserId;
        EnsureCurrentVersion(draft, expectedRowVersion);
        if (!draft.IsLocked || draft.LockedBy?.Id != actorId)
            throw new ConflictException("Only the current draft lock owner can release this lock.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var changed = await repository.ReleaseLockAsync(articleId, draft.DraftId, actorId,
            expectedRowVersion, now, Audit(actorId, ArticleAuditActions.DraftLockReleased,
                new { articleId, draftId = draft.DraftId }, now), cancellationToken);
        var canEdit = await CanEditAsync(changed.ArticleOwnerId, actorId, cancellationToken);
        return new(changed, canEdit, false);
    }

    public async Task<DraftLockData> ForceReleaseLockAsync(Guid articleId, byte[] expectedRowVersion,
        CancellationToken cancellationToken)
    {
        EnsureExpectedRowVersion(expectedRowVersion);
        await RequirePermissionAsync(PermissionCodes.LocksManage, cancellationToken);
        var draft = await GetCurrentAsync(articleId, cancellationToken);
        EnsureCurrentVersion(draft, expectedRowVersion);
        if (!draft.IsLocked)
            throw new ConflictException("The draft is not currently locked.");

        var actorId = currentUser.UserId;
        var previousOwnerId = draft.LockedBy?.Id;
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var changed = await repository.ForceReleaseLockAsync(articleId, draft.DraftId, actorId,
            expectedRowVersion, now, Audit(actorId, ArticleAuditActions.DraftLockForceReleased,
                new { articleId, draftId = draft.DraftId, previousOwnerId }, now), cancellationToken);
        var canEdit = await CanEditAsync(changed.ArticleOwnerId, actorId, cancellationToken);
        return new(changed, canEdit, false);
    }

    public async Task<CurrentDraftData> SaveContentAsync(Guid articleId, SaveDraftContentCommand command,
        CancellationToken cancellationToken)
    {
        EnsureExpectedRowVersion(command.RowVersion);
        var jsonBytes = SerializeAndValidateContent(command.Content);
        var htmlBytes = EncodeOptionalContent(command.RenderedHtml, "Rendered HTML");
        var textBytes = EncodeOptionalContent(command.PlainText, "Plain text");
        var draft = await GetCurrentAsync(articleId, cancellationToken);
        var actorId = currentUser.UserId;
        await RequireEditAsync(draft.ArticleOwnerId, actorId, cancellationToken);
        EnsureCurrentVersion(draft, command.RowVersion);
        if (!draft.IsLocked || draft.LockedBy?.Id != actorId)
            throw new ConflictException("Only the current draft lock owner can save draft content.");

        var stagedPaths = new List<string>(3);
        StagedDraftContent staged;
        try
        {
            var prefix = $"articles/{articleId:N}/drafts/{draft.DraftId:N}/{Guid.NewGuid():N}";
            var jsonPath = await UploadAsync($"{prefix}/content.json", jsonBytes, "application/json", stagedPaths,
                cancellationToken);
            var htmlPath = htmlBytes is null ? null : await UploadAsync($"{prefix}/content.html", htmlBytes,
                "text/html; charset=utf-8", stagedPaths, cancellationToken);
            var textPath = textBytes is null ? null : await UploadAsync($"{prefix}/content.txt", textBytes,
                "text/plain; charset=utf-8", stagedPaths, cancellationToken);
            staged = new(jsonPath, htmlPath, textPath,
                Convert.ToHexString(SHA256.HashData(jsonBytes)).ToLowerInvariant(), jsonBytes.LongLength);
        }
        catch (OperationCanceledException)
        {
            await DeleteBestEffortAsync(stagedPaths);
            throw;
        }
        catch (Exception exception)
        {
            await DeleteBestEffortAsync(stagedPaths);
            throw new ExternalServiceException("Draft content could not be staged in object storage.", exception);
        }

        CurrentDraftData changed;
        try
        {
            var now = timeProvider.GetUtcNow().UtcDateTime;
            changed = await repository.SaveContentAsync(articleId, draft.DraftId, actorId, command.RowVersion,
                staged, now, Audit(actorId, ArticleAuditActions.DraftContentSaved,
                    new { articleId, draftId = draft.DraftId, staged.ContentHash, staged.ContentSizeBytes }, now),
                cancellationToken);
        }
        catch
        {
            await DeleteBestEffortAsync(stagedPaths);
            throw;
        }

        var previousPaths = new[] { draft.ContentJsonPath, draft.RenderedHtmlPath, draft.PlainTextPath }
            .Where(path => !string.IsNullOrWhiteSpace(path) && !stagedPaths.Contains(path!, StringComparer.Ordinal))
            .Select(path => path!)
            .Distinct(StringComparer.Ordinal);
        await DeleteBestEffortAsync(previousPaths);
        return changed;
    }

    private async Task<CurrentDraftData> GetCurrentAsync(Guid articleId, CancellationToken cancellationToken)
    {
        EnsureId(articleId);
        EnsureAuthenticated();
        return await repository.GetCurrentAsync(articleId, cancellationToken)
            ?? throw new NotFoundException("The article draft was not found.");
    }

    private async Task<bool> CanEditAsync(Guid ownerId, Guid actorId, CancellationToken cancellationToken)
    {
        if (ownerId == actorId &&
            await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditOwnDraft, cancellationToken))
            return true;
        return await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditAnyDraft, cancellationToken);
    }

    private async Task RequireEditAsync(Guid ownerId, Guid actorId, CancellationToken cancellationToken)
    {
        if (!await CanEditAsync(ownerId, actorId, cancellationToken))
            throw new ForbiddenException("You do not have permission to edit this article draft.");
    }

    private async Task RequirePermissionAsync(string permission, CancellationToken cancellationToken)
    {
        EnsureAuthenticated();
        if (!await permissionChecker.HasPermissionAsync(currentUser.UserId, permission, cancellationToken))
            throw new ForbiddenException();
    }

    private byte[] SerializeAndValidateContent(JsonElement content)
    {
        if (content.ValueKind != JsonValueKind.Object ||
            !content.TryGetProperty("type", out var type) ||
            type.ValueKind != JsonValueKind.String || type.GetString() != "doc")
            throw new BusinessRuleException("Draft content must be a Tiptap JSON document with a 'doc' root.");

        var bytes = JsonSerializer.SerializeToUtf8Bytes(content);
        EnsureWithinLimit(bytes.LongLength, "Tiptap JSON");
        return bytes;
    }

    private byte[]? EncodeOptionalContent(string? content, string name)
    {
        if (content is null) return null;
        var bytes = Encoding.UTF8.GetBytes(content);
        EnsureWithinLimit(bytes.LongLength, name);
        return bytes;
    }

    private void EnsureWithinLimit(long size, string name)
    {
        if (size > options.MaxContentSizeBytes)
            throw new BusinessRuleException($"{name} cannot exceed {options.MaxContentSizeBytes} bytes.");
    }

    private async Task<string> UploadAsync(string objectName, byte[] content, string contentType,
        IList<string> stagedPaths, CancellationToken cancellationToken)
    {
        // Track the intended immutable name before upload so a provider failure after writing can still be cleaned up.
        stagedPaths.Add(objectName);
        await using var stream = new MemoryStream(content, writable: false);
        var storedPath = await storage.UploadAsync(options.ContainerName, objectName, stream, contentType,
            cancellationToken);
        if (string.IsNullOrWhiteSpace(storedPath))
            throw new InvalidOperationException("Object storage returned an empty object identifier.");
        if (!string.Equals(storedPath, objectName, StringComparison.Ordinal))
        {
            stagedPaths.Remove(objectName);
            stagedPaths.Add(storedPath);
        }
        return storedPath;
    }

    private async Task<JsonElement> DownloadContentAsync(string objectName, CancellationToken cancellationToken)
    {
        try
        {
            await using var source = await storage.DownloadAsync(options.ContainerName, objectName, cancellationToken);
            using var destination = new MemoryStream();
            var buffer = new byte[81920];
            while (true)
            {
                var read = await source.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;
                EnsureWithinLimit(destination.Length + read, "Stored Tiptap JSON");
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }

            using var document = JsonDocument.Parse(destination.ToArray());
            var content = document.RootElement;
            if (content.ValueKind != JsonValueKind.Object ||
                !content.TryGetProperty("type", out var type) || type.GetString() != "doc")
                throw new JsonException("Stored draft content does not have a Tiptap doc root.");
            return content.Clone();
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new ExternalServiceException("Draft content could not be loaded from object storage.", exception);
        }
    }

    private async Task DeleteBestEffortAsync(IEnumerable<string> paths)
    {
        foreach (var path in paths)
        {
            try
            {
                await storage.DeleteAsync(options.ContainerName, path, CancellationToken.None);
            }
            catch
            {
                // Staged/obsolete blobs are intentionally left for later orphan cleanup when deletion fails.
            }
        }
    }

    private static void EnsureCurrentVersion(CurrentDraftData draft, byte[] expectedRowVersion)
    {
        if (!draft.RowVersion.AsSpan().SequenceEqual(expectedRowVersion))
            throw new ConcurrencyConflictException();
    }

    private void EnsureAuthenticated()
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException();
    }

    private static void EnsureId(Guid articleId)
    {
        if (articleId == Guid.Empty)
            throw new BusinessRuleException("Article ID must not be an empty GUID.");
    }

    private static void EnsureExpectedRowVersion(byte[] expectedRowVersion)
    {
        if (expectedRowVersion.Length == 0)
            throw new BusinessRuleException("Row version is required.");
    }

    private static DraftAuditData Audit(Guid actorId, string action, object metadata, DateTime createdAt) =>
        new(actorId, action, JsonSerializer.Serialize(metadata), createdAt);

    private static JsonElement CreateEmptyDocument()
    {
        using var document = JsonDocument.Parse("""{"type":"doc","content":[]}""");
        return document.RootElement.Clone();
    }
}
