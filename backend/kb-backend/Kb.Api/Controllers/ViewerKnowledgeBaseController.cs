using Kb.Api.Authentication;
using Kb.Application.Viewer;
using Kb.Contracts.Viewer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = ViewerAuthenticationDefaults.Scheme)]
[Route("api/viewer/{solutionSlug}")]
public sealed class ViewerKnowledgeBaseController(ViewerService viewers) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ViewerPortalResponse>> Portal(string solutionSlug, CancellationToken token)
    {
        var portal = await viewers.GetPortalAsync(solutionSlug, token);
        return Ok(new ViewerPortalResponse(portal.RootId, portal.Slug, portal.Name, portal.Description,
            MapAppearance(portal.Appearance)));
    }

    [HttpGet("categories/tree")]
    public async Task<ActionResult<IReadOnlyList<ViewerCategoryNodeResponse>>> Categories(string solutionSlug,
        CancellationToken token) => Ok((await viewers.GetTreeAsync(solutionSlug, token)).Select(Map).ToArray());

    [HttpGet("categories/{categoryId:guid}/image")]
    public async Task<IActionResult> CategoryImage(string solutionSlug, Guid categoryId, CancellationToken token)
    {
        var image = await viewers.GetCategoryImageAsync(solutionSlug, categoryId, token);
        Response.Headers.CacheControl = "private, max-age=300";
        return File(image.Content, image.MimeType, enableRangeProcessing: true);
    }

    [HttpGet("articles")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Articles(string solutionSlug,
        [FromQuery] string? search, [FromQuery] Guid? categoryId, CancellationToken token) =>
        Ok((await viewers.GetArticlesAsync(solutionSlug, search, categoryId, token)).Select(Map).ToArray());

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Search(string solutionSlug,
        [FromQuery] string query, CancellationToken token) =>
        Ok((await viewers.SearchAsync(solutionSlug, query, token)).Select(Map).ToArray());

    [HttpGet("articles/by-id/{articleId:guid}")]
    public async Task<ActionResult<ViewerArticleResponse>> ArticleById(string solutionSlug, Guid articleId,
        CancellationToken token) => Map(await viewers.GetArticleByIdAsync(solutionSlug, articleId,
            HttpContext.Connection.RemoteIpAddress?.ToString(), Request.Headers.UserAgent.ToString(), token));

    [HttpGet("articles/{articleSlug}")]
    public async Task<ActionResult<ViewerArticleResponse>> Article(string solutionSlug, string articleSlug,
        CancellationToken token) => Map(await viewers.GetArticleBySlugAsync(solutionSlug, articleSlug,
            HttpContext.Connection.RemoteIpAddress?.ToString(), Request.Headers.UserAgent.ToString(), token));

    private static ViewerCategoryNodeResponse Map(ViewerCategoryNode item) => new(item.Id, item.ParentId, item.Name,
        item.Slug, item.Description, item.SortOrder, item.Path, item.Depth, item.ArticleCount,
        item.Children.Select(Map).ToArray(), item.HasViewerImage, item.ViewerIcon, item.DisplayColor);
    private static ViewerArticleSummaryResponse Map(ViewerArticleSummary item) => new(item.Id, item.Title,
        item.Slug, item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt);
    private static ViewerArticleResponse Map(ViewerArticle item) => new(item.Id, item.Title, item.Slug,
        item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt, item.Content);
    private static ViewerDashboardAppearanceResponse MapAppearance(ViewerDashboardAppearanceData? appearance)
    {
        var value = appearance ?? ViewerDashboardAppearanceData.Default;
        return new(value.PrimaryColor, value.PageBackgroundColor, value.CategoryCardBackgroundColor, value.TextColor);
    }
}
