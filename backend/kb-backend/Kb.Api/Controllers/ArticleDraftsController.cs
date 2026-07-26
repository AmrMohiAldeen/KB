using Kb.Application.Authorization;
using Kb.Application.Drafts;
using Kb.Contracts.Common;
using Kb.Contracts.Drafts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/articles/{articleId:guid}/draft")]
public sealed class ArticleDraftsController(ArticleDraftService drafts) : ControllerBase
{
    private const string ManageLocksPolicy = PermissionPolicy.Prefix + PermissionCodes.LocksManage;

    [HttpGet]
    [ProducesResponseType<ArticleDraftResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<ArticleDraftResponse>> Get(Guid articleId,
        CancellationToken cancellationToken) =>
        Ok(ToResponse(await drafts.GetAsync(articleId, cancellationToken)));

    [HttpPost("lock")]
    [ProducesResponseType<DraftLockMutationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DraftLockMutationResponse>> AcquireLock(Guid articleId,
        DraftConcurrencyRequest request, CancellationToken cancellationToken) =>
        Ok(ToLockResponse(await drafts.AcquireLockAsync(articleId, Decode(request.RowVersion), cancellationToken)));

    [HttpDelete("lock")]
    [ProducesResponseType<DraftLockMutationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DraftLockMutationResponse>> ReleaseLock(Guid articleId,
        [FromBody] DraftConcurrencyRequest request, CancellationToken cancellationToken) =>
        Ok(ToLockResponse(await drafts.ReleaseLockAsync(articleId, Decode(request.RowVersion), cancellationToken)));

    [HttpPost("lock/force-release")]
    [Authorize(Policy = ManageLocksPolicy)]
    [ProducesResponseType<DraftLockMutationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DraftLockMutationResponse>> ForceReleaseLock(Guid articleId,
        DraftConcurrencyRequest request, CancellationToken cancellationToken) =>
        Ok(ToLockResponse(await drafts.ForceReleaseLockAsync(articleId, Decode(request.RowVersion), cancellationToken)));

    [HttpPut("content")]
    [ProducesResponseType<SaveArticleDraftResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<SaveArticleDraftResponse>> SaveContent(Guid articleId,
        SaveArticleDraftRequest request, CancellationToken cancellationToken)
    {
        var saved = await drafts.SaveContentAsync(articleId,
            new(request.Content, request.RenderedHtml, request.PlainText, Decode(request.RowVersion)),
            cancellationToken);
        return Ok(new SaveArticleDraftResponse(saved.DraftId, saved.ContentHash, saved.ContentSizeBytes,
            Convert.ToBase64String(saved.RowVersion), saved.UpdatedAt));
    }

    private static ArticleDraftResponse ToResponse(DraftViewData value) => new(
        value.Draft.DraftId,
        value.Draft.ArticleId,
        value.Content,
        value.Draft.ContentHash,
        value.Draft.ContentSizeBytes,
        Convert.ToBase64String(value.Draft.RowVersion),
        value.Draft.Status,
        ToLock(value.Draft),
        value.CanEdit,
        value.IsLockOwner,
        ToUser(value.Draft.CreatedBy),
        value.Draft.UpdatedBy is null ? null : ToUser(value.Draft.UpdatedBy),
        value.Draft.CreatedAt,
        value.Draft.UpdatedAt);

    private static DraftLockMutationResponse ToLockResponse(DraftLockData value) => new(
        Convert.ToBase64String(value.Draft.RowVersion),
        ToLock(value.Draft),
        value.CanEdit,
        value.IsLockOwner,
        value.Draft.UpdatedAt);

    private static DraftLockStatusResponse ToLock(CurrentDraftData draft) => new(
        draft.IsLocked,
        draft.LockedBy is null ? null : ToUser(draft.LockedBy),
        draft.LockedAt);

    private static UserSummaryResponse ToUser(DraftUserData user) => new(user.Id, user.Name);
    private static byte[] Decode(string rowVersion) => Convert.FromBase64String(rowVersion);
}
