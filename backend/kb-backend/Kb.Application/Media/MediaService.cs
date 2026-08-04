using System.Text.Json;
using Kb.Application.Abstractions;
using Kb.Application.Abstractions.Storage;
using Kb.Application.Exceptions;
using Kb.Domain.Constants;
using Microsoft.Extensions.Options;

namespace Kb.Application.Media;

public sealed class MediaService(
    IMediaRepository repository,
    IObjectStorage storage,
    ICurrentUser currentUser,
    IPermissionChecker permissionChecker,
    TimeProvider timeProvider,
    IOptions<MediaOptions> optionsAccessor)
{
    public const int DefaultPageSize = 20;
    public const int MaximumPageSize = 100;

    private readonly MediaOptions options = ValidateOptions(optionsAccessor.Value);

    public async Task<PagedMediaData> GetPagedAsync(string? search, string? mediaType, string? status,
        int page, int pageSize, CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        if (page < 1) throw new BusinessRuleException("Page must be at least 1.");
        if (pageSize is < 1 or > MaximumPageSize)
            throw new BusinessRuleException($"Page size must be between 1 and {MaximumPageSize}.");
        search = NormalizeSearch(search);
        status = NormalizeStatus(status);
        return await repository.GetPagedAsync(
            new(search, MediaFileInspector.ParseKind(mediaType), status, page, pageSize), cancellationToken);
    }

    public async Task<MediaFileData> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        return await repository.GetByIdAsync(id, cancellationToken)
            ?? throw new NotFoundException("The media file was not found.");
    }

    public async Task<MediaFileData> UploadAsync(MediaUploadCommand command, CancellationToken cancellationToken)
    {
        var actorId = await RequirePermissionAsync(PermissionCodes.ArticlesCreate, cancellationToken);
        if (!await repository.ActiveUserExistsAsync(actorId, cancellationToken))
            throw new NotFoundException("The authenticated internal user was not found or is inactive.");

        var inspected = await MediaFileInspector.InspectAsync(command, options.MaxFileSizeBytes, cancellationToken);
        var mediaId = Guid.NewGuid();
        var storedFileName = $"{mediaId:N}{inspected.Extension}";
        var objectName = $"{timeProvider.GetUtcNow():yyyy/MM}/{storedFileName}";
        EnsureSafeObjectName(objectName);

        string storedPath;
        try
        {
            storedPath = await storage.UploadAsync(options.ContainerName, objectName, inspected.UploadStream,
                inspected.ContentType, cancellationToken);
            EnsureSafeObjectName(storedPath);
            if (!string.Equals(storedPath, objectName, StringComparison.Ordinal))
                throw new InvalidOperationException("Object storage returned an unexpected object identifier.");
        }
        catch (OperationCanceledException)
        {
            await DeleteBestEffortAsync(objectName);
            throw;
        }
        catch (Exception exception)
        {
            await DeleteBestEffortAsync(objectName);
            throw new ExternalServiceException("The media file could not be stored.", exception);
        }

        var uploadedAt = timeProvider.GetUtcNow().UtcDateTime;
        var newMedia = new NewMediaData(mediaId, command.OriginalFileName.Trim(), storedFileName,
            inspected.ContentType, inspected.Extension, command.FileSizeBytes, storedPath, actorId, uploadedAt);
        try
        {
            return await repository.InsertWithAuditAsync(newMedia,
                Audit(actorId, MediaAuditActions.Uploaded, new
                {
                    mediaId,
                    originalFileName = newMedia.OriginalFileName,
                    contentType = newMedia.MimeType,
                    fileSizeBytes = newMedia.FileSizeBytes
                }, uploadedAt), cancellationToken);
        }
        catch
        {
            await DeleteBestEffortAsync(storedPath);
            throw;
        }
    }

    public async Task<MediaContentData> DownloadAsync(Guid id, CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        var media = await repository.GetByIdAsync(id, cancellationToken)
            ?? throw new NotFoundException("The media file was not found.");
        if (!string.Equals(media.Status, MediaStatuses.Active, StringComparison.Ordinal))
            throw new NotFoundException("The media file is not available.");
        EnsureSafeObjectName(media.StoragePath);
        try
        {
            var stream = await storage.DownloadAsync(options.ContainerName, media.StoragePath, cancellationToken);
            return new(stream, media.MimeType, media.OriginalFileName);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new ExternalServiceException("The media file could not be loaded.", exception);
        }
    }

    public async Task<MediaFileData> ArchiveAsync(Guid id, CancellationToken cancellationToken)
    {
        var actorId = await RequirePermissionAsync(PermissionCodes.ArticlesDelete, cancellationToken);
        var media = await GetExistingForMutationAsync(id, cancellationToken);
        if (media.Status == MediaStatuses.Archived) return media;
        if (media.Status != MediaStatuses.Active)
            throw new ConflictException("Only active media can be archived.");
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return await repository.SetStatusWithAuditAsync(id, MediaStatuses.Active, MediaStatuses.Archived,
            Audit(actorId, MediaAuditActions.Archived, new { mediaId = id }, now), cancellationToken);
    }

    public async Task<MediaFileData> RestoreAsync(Guid id, CancellationToken cancellationToken)
    {
        var actorId = await RequirePermissionAsync(PermissionCodes.ArticlesDelete, cancellationToken);
        var media = await GetExistingForMutationAsync(id, cancellationToken);
        if (media.Status == MediaStatuses.Active) return media;
        if (media.Status != MediaStatuses.Archived)
            throw new ConflictException("Only archived media can be restored.");
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return await repository.SetStatusWithAuditAsync(id, MediaStatuses.Archived, MediaStatuses.Active,
            Audit(actorId, MediaAuditActions.Restored, new { mediaId = id }, now), cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var actorId = await RequirePermissionAsync(PermissionCodes.ArticlesDelete, cancellationToken);
        var media = await GetExistingForMutationAsync(id, cancellationToken);
        if (media.Status == MediaStatuses.Deleted) return;
        if (media.Status != MediaStatuses.Archived)
            throw new ConflictException("Media must be archived before it can be permanently deleted.");
        if (media.ReferenceCount != 0)
            throw new ConflictException("Referenced media cannot be permanently deleted.");
        EnsureSafeObjectName(media.StoragePath);

        try
        {
            await storage.DeleteAsync(options.ContainerName, media.StoragePath, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new ExternalServiceException("The media object could not be deleted.", exception);
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        await repository.SetStatusWithAuditAsync(id, MediaStatuses.Archived, MediaStatuses.Deleted,
            Audit(actorId, MediaAuditActions.Deleted, new { mediaId = id }, now), cancellationToken);
    }

    public async Task<MediaReferenceData> CreateReferenceAsync(Guid mediaId,
        CreateMediaReferenceCommand command, CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        var media = await repository.GetByIdAsync(mediaId, cancellationToken)
            ?? throw new NotFoundException("The media file was not found.");
        if (media.Status != MediaStatuses.Active)
            throw new ConflictException("Only active media can be referenced.");

        var entityType = NormalizeReferenceType(command.EntityType);
        var target = await repository.ResolveReferenceTargetAsync(entityType, command.EntityId, cancellationToken)
            ?? throw new NotFoundException("The media reference target was not found.");
        if (command.ArticleId.HasValue && command.ArticleId != target.ArticleId)
            throw new BusinessRuleException("The supplied article does not match the reference target.");
        await RequireReferencePermissionAsync(target, cancellationToken);
        return await repository.AddReferenceAsync(mediaId, target, cancellationToken);
    }

    public async Task RemoveReferenceAsync(Guid mediaId, Guid referenceId,
        CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        var reference = await repository.GetReferenceAsync(mediaId, referenceId, cancellationToken)
            ?? throw new NotFoundException("The media reference was not found.");
        var target = await repository.ResolveReferenceTargetAsync(reference.EntityType, reference.EntityId,
            cancellationToken) ?? throw new NotFoundException("The media reference target was not found.");
        await RequireReferencePermissionAsync(target, cancellationToken);
        await repository.RemoveReferenceAsync(mediaId, referenceId, cancellationToken);
    }

    public async Task<IReadOnlyList<MediaReferenceData>> SynchronizeDraftReferencesAsync(Guid articleId,
        IReadOnlyCollection<Guid> mediaIds, CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        if (mediaIds.Count > 500)
            throw new BusinessRuleException("A draft cannot reference more than 500 media files.");
        if (mediaIds.Any(id => id == Guid.Empty))
            throw new BusinessRuleException("Media identifiers must be non-empty GUIDs.");

        var target = await repository.GetCurrentDraftTargetAsync(articleId, cancellationToken)
            ?? throw new NotFoundException("The current article draft was not found.");
        await RequireReferencePermissionAsync(target, cancellationToken);

        var distinctIds = mediaIds.Distinct().ToArray();
        foreach (var mediaId in distinctIds)
        {
            var media = await repository.GetByIdAsync(mediaId, cancellationToken)
                ?? throw new NotFoundException($"Media file {mediaId} was not found.");
            if (media.Status != MediaStatuses.Active)
                throw new ConflictException($"Media file {mediaId} is not active.");
        }
        return await repository.SynchronizeReferencesAsync(distinctIds, target, cancellationToken);
    }

    private void RequireAuthenticated()
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
    }

    private async Task<Guid> RequirePermissionAsync(string permission, CancellationToken cancellationToken)
    {
        RequireAuthenticated();
        var actorId = currentUser.UserId;
        if (!await permissionChecker.HasPermissionAsync(actorId, permission, cancellationToken))
            throw new ForbiddenException();
        return actorId;
    }

    private async Task RequireReferencePermissionAsync(MediaReferenceTargetData target,
        CancellationToken cancellationToken)
    {
        var actorId = currentUser.UserId;
        if (target.EntityType == MediaReferenceTypes.ReusableBlock)
        {
            if (!await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.TemplatesManage,
                    cancellationToken))
                throw new ForbiddenException("You do not have permission to manage reusable block media.");
            return;
        }
        if (target.EntityType == MediaReferenceTypes.Version)
        {
            if (!await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.VersionsRestore,
                    cancellationToken))
                throw new ForbiddenException("You do not have permission to manage version media.");
            return;
        }
        if (target.EntityType == MediaReferenceTypes.Comment)
        {
            if (!await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.CommentsCreate,
                    cancellationToken))
                throw new ForbiddenException("You do not have permission to manage comment media.");
            return;
        }

        var canEdit = target.ArticleOwnerId == actorId
            ? await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditOwnDraft,
                cancellationToken) ||
              await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditAnyDraft,
                  cancellationToken)
            : await permissionChecker.HasPermissionAsync(actorId, PermissionCodes.ArticlesEditAnyDraft,
                cancellationToken);
        if (!canEdit)
            throw new ForbiddenException("You do not have permission to manage media for this article.");
    }

    private async Task<MediaFileData> GetExistingForMutationAsync(Guid id,
        CancellationToken cancellationToken) =>
        await repository.GetByIdAsync(id, cancellationToken)
        ?? throw new NotFoundException("The media file was not found.");

    private async Task DeleteBestEffortAsync(string objectName)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(objectName))
                await storage.DeleteAsync(options.ContainerName, objectName, CancellationToken.None);
        }
        catch
        {
            // Orphan cleanup can retry later when compensating deletion is unavailable.
        }
    }

    private static MediaAuditData Audit(Guid actorId, string action, object metadata, DateTime createdAt,
        Guid? articleId = null) =>
        new(actorId, action, JsonSerializer.Serialize(metadata), createdAt, articleId);

    private static string? NormalizeSearch(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        if (value.Length > 260) throw new BusinessRuleException("Search cannot exceed 260 characters.");
        return value;
    }

    private static string? NormalizeStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var status = MediaStatuses.All.FirstOrDefault(item =>
            item.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));
        return status ?? throw new BusinessRuleException("The media status is invalid.");
    }

    private static string NormalizeReferenceType(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new BusinessRuleException("A media reference entity type is required.");
        return MediaReferenceTypes.All.FirstOrDefault(item =>
                   item.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase))
               ?? throw new BusinessRuleException("The media reference entity type is invalid.");
    }

    private static MediaOptions ValidateOptions(MediaOptions value)
    {
        if (string.IsNullOrWhiteSpace(value.ContainerName))
            throw new InvalidOperationException("The media storage container is not configured.");
        if (value.MaxFileSizeBytes <= 0)
            throw new InvalidOperationException("The media maximum file size must be positive.");
        return value;
    }

    private static void EnsureSafeObjectName(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 1024 ||
            value.StartsWith('/') || value.StartsWith('\\') || value.Contains('\\') ||
            value.Split('/').Any(segment => segment is "" or "." or "..") ||
            value.Any(character => !(char.IsAsciiLetterOrDigit(character) ||
                                     character is '/' or '-' or '_' or '.')))
            throw new InvalidOperationException("The media object identifier is invalid.");
    }
}
