using Kb.Application.Media;
using Kb.Contracts.Media;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/articles/{articleId:guid}/draft/media-references")]
public sealed class DraftMediaReferencesController(MediaService media) : ControllerBase
{
    [HttpPut]
    [ProducesResponseType<IReadOnlyList<MediaReferenceResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<IReadOnlyList<MediaReferenceResponse>>> Synchronize(
        Guid articleId, SynchronizeDraftMediaReferencesRequest request,
        CancellationToken cancellationToken)
    {
        var references = await media.SynchronizeDraftReferencesAsync(articleId, request.MediaIds,
            cancellationToken);
        return Ok(references.Select(MediaController.ToReferenceResponse).ToArray());
    }
}
