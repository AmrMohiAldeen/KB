using Kb.Api.Authentication;
using Kb.Application.Viewer;
using Kb.Contracts.Viewer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

// This intentionally uses the application's internal authentication scheme. External Viewer cookies are
// accepted only by ViewerKnowledgeBaseController and cannot authorize this internal preview surface.
[ApiController]
[Authorize(Policy = ViewerPreviewAuthorizationDefaults.Policy)]
[Route("api/viewer/preview/{rootCategoryId:guid}")]
public sealed class ViewerPreviewController(ViewerService viewers) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ViewerPortalResponse>> Portal(Guid rootCategoryId, CancellationToken token)
    {
        var portal = await viewers.GetPreviewPortalAsync(rootCategoryId, token);
        return Ok(new ViewerPortalResponse(portal.RootId, portal.Slug, portal.Name, portal.Description));
    }

    [HttpGet("categories/tree")]
    public async Task<ActionResult<IReadOnlyList<ViewerCategoryNodeResponse>>> Categories(Guid rootCategoryId,
        CancellationToken token) =>
        Ok((await viewers.GetPreviewTreeAsync(rootCategoryId, token)).Select(Map).ToArray());

    [HttpGet("articles")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Articles(Guid rootCategoryId,
        [FromQuery] string? search, [FromQuery] Guid? categoryId, CancellationToken token) =>
        Ok((await viewers.GetPreviewArticlesAsync(rootCategoryId, search, categoryId, token)).Select(Map).ToArray());

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Search(Guid rootCategoryId,
        [FromQuery] string query, CancellationToken token) =>
        Ok((await viewers.SearchPreviewAsync(rootCategoryId, query, token)).Select(Map).ToArray());

    [HttpGet("articles/by-id/{articleId:guid}")]
    public async Task<ActionResult<ViewerArticleResponse>> ArticleById(Guid rootCategoryId, Guid articleId,
        CancellationToken token) => Map(await viewers.GetPreviewArticleByIdAsync(rootCategoryId, articleId, token));

    [HttpGet("articles/{articleSlug}")]
    public async Task<ActionResult<ViewerArticleResponse>> Article(Guid rootCategoryId, string articleSlug,
        CancellationToken token) => Map(await viewers.GetPreviewArticleBySlugAsync(rootCategoryId, articleSlug, token));

    private static ViewerCategoryNodeResponse Map(ViewerCategoryNode item) => new(item.Id, item.ParentId, item.Name,
        item.Slug, item.Description, item.SortOrder, item.Path, item.Depth, item.ArticleCount,
        item.Children.Select(Map).ToArray());
    private static ViewerArticleSummaryResponse Map(ViewerArticleSummary item) => new(item.Id, item.Title,
        item.Slug, item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt);
    private static ViewerArticleResponse Map(ViewerArticle item) => new(item.Id, item.Title, item.Slug,
        item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt, item.Content);
}
