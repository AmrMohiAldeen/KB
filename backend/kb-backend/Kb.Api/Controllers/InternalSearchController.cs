using Kb.Api.Authorization;
using Kb.Application.Search;
using Kb.Contracts.Search;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard/search")]
public sealed class InternalSearchController(InternalSearchService search, IInternalSearchMaintenance maintenance)
    : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<InternalSearchResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<InternalSearchResponse>> Get([FromQuery] string? query,
        [FromQuery] string? status, [FromQuery] Guid? categoryId, [FromQuery] Guid? ownerId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = InternalSearchService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var result = await search.SearchAsync(query, status, categoryId, ownerId, page, pageSize, cancellationToken);
        return Ok(new InternalSearchResponse(
            result.Hits.Select(hit => new InternalSearchHitResponse(hit.Kind, hit.Id, hit.Title, hit.Slug,
                hit.Status, hit.CategoryId, hit.CategoryName, hit.CategoryPath, hit.OwnerId, hit.OwnerName,
                hit.UpdatedAt, hit.TitleHighlight, hit.PathHighlight, hit.Snippet)).ToArray(),
            result.TotalCount, result.Page, result.PageSize,
            result.Statuses.Select(f => new InternalSearchFacetResponse(f.Value, f.Count)).ToArray(),
            result.Categories.Select(f => new InternalSearchFacetResponse(f.Value, f.Count)).ToArray(),
            result.Owners.Select(f => new InternalSearchFacetResponse(f.Value, f.Count)).ToArray()));
    }

    [HttpPost("rebuild")]
    [Authorize(Policy = AdminPolicy.Name)]
    [ProducesResponseType<InternalSearchRebuildResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<InternalSearchRebuildResponse>> Rebuild(CancellationToken cancellationToken)
    {
        var result = await maintenance.RebuildAsync(cancellationToken);
        return Ok(new InternalSearchRebuildResponse(result.Collection, result.ArticleCount, result.CategoryCount));
    }
}
