using Kb.Application.Authorization;
using Kb.Application.Media;
using Kb.Contracts.Common;
using Kb.Contracts.Media;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/media")]
public sealed class MediaController(MediaService media) : ControllerBase
{
    private const string UploadPolicy = PermissionPolicy.Prefix + PermissionCodes.ArticlesCreate;
    private const string ManagePolicy = PermissionPolicy.Prefix + PermissionCodes.ArticlesDelete;

    [HttpGet]
    [ProducesResponseType<PagedResponse<MediaListItemResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<PagedResponse<MediaListItemResponse>>> GetList(
        [FromQuery] string? search,
        [FromQuery] string? mediaType,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = MediaService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var result = await media.GetPagedAsync(search, mediaType, status, page, pageSize,
            cancellationToken);
        return Ok(new PagedResponse<MediaListItemResponse>(
            result.Items.Select(ToListResponse).ToArray(), result.Page, result.PageSize,
            result.TotalCount));
    }

    [HttpGet("{id:guid}", Name = "GetMediaById")]
    [ProducesResponseType<MediaDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MediaDetailsResponse>> GetById(Guid id,
        CancellationToken cancellationToken) =>
        Ok(ToDetailsResponse(await media.GetAsync(id, cancellationToken)));

    [HttpPost]
    [Authorize(Policy = UploadPolicy)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<MediaUploadResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<MediaUploadResponse>> Upload([FromForm] IFormFile file,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var uploaded = await media.UploadAsync(new(file.FileName, file.ContentType, file.Length, stream),
            cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = uploaded.Id }, ToUploadResponse(uploaded));
    }

    [HttpGet("{id:guid}/content")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Stream(Guid id, CancellationToken cancellationToken)
    {
        var result = await media.DownloadAsync(id, cancellationToken);
        return File(result.Content, result.ContentType, enableRangeProcessing: true);
    }

    [HttpGet("{id:guid}/download")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var result = await media.DownloadAsync(id, cancellationToken);
        return File(result.Content, result.ContentType, result.DownloadFileName,
            enableRangeProcessing: true);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<MediaDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<MediaDetailsResponse>> Archive(Guid id,
        CancellationToken cancellationToken) =>
        Ok(ToDetailsResponse(await media.ArchiveAsync(id, cancellationToken)));

    [HttpPost("{id:guid}/restore")]
    [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<MediaDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<MediaDetailsResponse>> Restore(Guid id,
        CancellationToken cancellationToken) =>
        Ok(ToDetailsResponse(await media.RestoreAsync(id, cancellationToken)));

    [HttpDelete("{id:guid}/permanent")]
    [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await media.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/references")]
    [ProducesResponseType<MediaReferenceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<MediaReferenceResponse>> CreateReference(Guid id,
        CreateMediaReferenceRequest request, CancellationToken cancellationToken)
    {
        var created = await media.CreateReferenceAsync(id,
            new(request.ArticleId, request.ReferenceEntityType, request.ReferenceEntityId),
            cancellationToken);
        return Ok(ToReferenceResponse(created));
    }

    [HttpDelete("{id:guid}/references/{referenceId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RemoveReference(Guid id, Guid referenceId,
        CancellationToken cancellationToken)
    {
        await media.RemoveReferenceAsync(id, referenceId, cancellationToken);
        return NoContent();
    }

    private static MediaListItemResponse ToListResponse(MediaFileData item) => new(
        item.Id, item.OriginalFileName, item.MimeType, item.FileExtension, item.FileSizeBytes,
        DownloadUrl(item.Id), item.Status, ToUser(item.UploadedBy), item.UploadedAt,
        item.ReferenceCount);

    private static MediaDetailsResponse ToDetailsResponse(MediaFileData item) => new(
        item.Id, item.OriginalFileName, item.MimeType, item.FileExtension, item.FileSizeBytes,
        DownloadUrl(item.Id), item.Status, ToUser(item.UploadedBy), item.UploadedAt,
        item.ReferenceCount);

    private static MediaUploadResponse ToUploadResponse(MediaFileData item) => new(
        item.Id, item.OriginalFileName, item.MimeType, item.FileExtension, item.FileSizeBytes,
        DownloadUrl(item.Id), item.Status, item.UploadedAt);

    internal static MediaReferenceResponse ToReferenceResponse(MediaReferenceData item) => new(
        item.Id, item.MediaId, item.ArticleId, item.EntityType, item.EntityId);

    private static UserSummaryResponse ToUser(MediaUserData user) => new(user.Id, user.Name);
    private static string DownloadUrl(Guid id) => $"/api/media/{id:D}/content";
}
