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
[Route("api/viewer/preview/{rootCategorySlug}")]
public sealed class ViewerPreviewController(ViewerService viewers) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ViewerPortalResponse>> Portal(string rootCategorySlug, CancellationToken token)
    {
        var portal = await viewers.GetPreviewPortalAsync(rootCategorySlug, token);
        return Ok(new ViewerPortalResponse(portal.RootId, portal.Slug, portal.Name, portal.Description));
    }

    [HttpGet("categories/tree")]
    public async Task<ActionResult<IReadOnlyList<ViewerCategoryNodeResponse>>> Categories(string rootCategorySlug,
        CancellationToken token) =>
        Ok((await viewers.GetPreviewTreeAsync(rootCategorySlug, token)).Select(Map).ToArray());

    [HttpGet("articles")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Articles(string rootCategorySlug,
        [FromQuery] string? search, [FromQuery] Guid? categoryId, CancellationToken token) =>
        Ok((await viewers.GetPreviewArticlesAsync(rootCategorySlug, search, categoryId, token)).Select(Map).ToArray());

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Search(string rootCategorySlug,
        [FromQuery] string query, CancellationToken token) =>
        Ok((await viewers.SearchPreviewAsync(rootCategorySlug, query, token)).Select(Map).ToArray());

    [HttpGet("articles/by-id/{articleId:guid}")]
    public async Task<ActionResult<ViewerArticleResponse>> ArticleById(string rootCategorySlug, Guid articleId,
        CancellationToken token) => Map(await viewers.GetPreviewArticleByIdAsync(rootCategorySlug, articleId, token));

    [HttpGet("articles/{articleSlug}")]
    public async Task<ActionResult<ViewerArticleResponse>> Article(string rootCategorySlug, string articleSlug,
        CancellationToken token) => Map(await viewers.GetPreviewArticleBySlugAsync(rootCategorySlug, articleSlug, token));

    private static ViewerCategoryNodeResponse Map(ViewerCategoryNode item) => new(item.Id, item.ParentId, item.Name,
        item.Slug, item.Description, item.SortOrder, item.Path, item.Depth, item.ArticleCount,
        item.Children.Select(Map).ToArray());
    private static ViewerArticleSummaryResponse Map(ViewerArticleSummary item) => new(item.Id, item.Title,
        item.Slug, item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt);
    private static ViewerArticleResponse Map(ViewerArticle item) => new(item.Id, item.Title, item.Slug,
        item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt, item.Content);
}
