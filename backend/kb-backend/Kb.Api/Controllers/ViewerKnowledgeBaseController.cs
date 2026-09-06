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
    public async Task<ActionResult<ViewerPortalResponse>> Portal(string solutionSlug, [FromQuery] string? locale,
        CancellationToken token)
    {
        var portal = await viewers.GetPortalAsync(solutionSlug, locale, token);
        return Ok(new ViewerPortalResponse(portal.RootId, portal.Slug, portal.Name, portal.Description,
            MapLanguage(portal.ActiveLanguage), portal.Languages.Select(MapLanguage).ToArray(),
            MapAppearance(portal.Appearance)));
    }

    [HttpGet("categories/tree")]
    public async Task<ActionResult<IReadOnlyList<ViewerCategoryNodeResponse>>> Categories(string solutionSlug,
        [FromQuery] string? locale, CancellationToken token) =>
        Ok((await viewers.GetTreeAsync(solutionSlug, locale, token)).Select(Map).ToArray());

    [HttpGet("categories/{categoryId:guid}/image")]
    public async Task<IActionResult> CategoryImage(string solutionSlug, Guid categoryId, CancellationToken token)
    {
        var image = await viewers.GetCategoryImageAsync(solutionSlug, categoryId, token);
        Response.Headers.CacheControl = "private, max-age=300";
        return File(image.Content, image.MimeType, enableRangeProcessing: true);
    }

    [HttpGet("articles")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Articles(string solutionSlug,
        [FromQuery] string? locale, [FromQuery] string? search, [FromQuery] Guid? categoryId, CancellationToken token) =>
        Ok((await viewers.GetArticlesAsync(solutionSlug, locale, search, categoryId, token)).Select(Map).ToArray());

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<ViewerArticleSummaryResponse>>> Search(string solutionSlug,
        [FromQuery] string? locale, [FromQuery] string query, CancellationToken token) =>
        Ok((await viewers.SearchAsync(solutionSlug, locale, query, token)).Select(Map).ToArray());

    [HttpGet("articles/by-id/{articleId:guid}")]
    public async Task<ActionResult<ViewerArticleResponse>> ArticleById(string solutionSlug, Guid articleId,
        [FromQuery] string? locale, CancellationToken token) => Map(await viewers.GetArticleByIdAsync(solutionSlug, articleId, locale,
            HttpContext.Connection.RemoteIpAddress?.ToString(), Request.Headers.UserAgent.ToString(), token));

    [HttpGet("articles/{articleSlug}")]
    public async Task<ActionResult<ViewerArticleResponse>> Article(string solutionSlug, string articleSlug,
        [FromQuery] string? locale, CancellationToken token) => Map(await viewers.GetArticleBySlugAsync(solutionSlug, articleSlug, locale,
            HttpContext.Connection.RemoteIpAddress?.ToString(), Request.Headers.UserAgent.ToString(), token));

    private static ViewerCategoryNodeResponse Map(ViewerCategoryNode item) => new(item.Id, item.ParentId, item.Name,
        item.Slug, item.Description, item.SortOrder, item.Path, item.Depth, item.ArticleCount,
        item.Children.Select(Map).ToArray(), item.HasViewerImage, item.ViewerIcon, item.DisplayColor);
    private static ViewerArticleSummaryResponse Map(ViewerArticleSummary item) => new(item.Id, item.Title,
        item.Slug, item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt);
    private static ViewerArticleResponse Map(ViewerArticle item) => new(item.Id, item.Title, item.Slug,
        item.CategoryId, item.CategoryName, item.CategoryPath, item.UpdatedAt, item.Content,
        MapLanguage(item.ActiveLanguage), item.Languages.Select(MapLanguage).ToArray(),
        item.AvailableTranslations.Select(value => new ViewerArticleTranslationResponse(
            value.Id, value.LocaleCode, value.Slug)).ToArray());
    private static ViewerLanguageResponse MapLanguage(ViewerLanguageData item) => new(item.LocaleCode,
        item.DisplayName, item.NativeName, item.IsDefault, item.IsRtl);
    private static ViewerDashboardAppearanceResponse MapAppearance(ViewerDashboardAppearanceData? appearance)
    {
        var value = appearance ?? ViewerDashboardAppearanceData.Default;
        return new(value.PrimaryColor, value.PageBackgroundColor, value.CategoryCardBackgroundColor, value.TextColor);
    }
}
