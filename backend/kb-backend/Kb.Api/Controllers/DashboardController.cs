using Kb.Application.Articles;
using Kb.Application.Authorization;
using Kb.Application.Dashboard;
using Kb.Contracts.Articles;
using Kb.Contracts.Common;
using Kb.Contracts.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public sealed class DashboardController(DashboardService dashboard, DashboardBulkService bulkActions) : ControllerBase
{
    private const string ManageCategoriesPolicy = PermissionPolicy.Prefix + PermissionCodes.CategoriesManage;
    private const string ReorderArticlesPolicy = PermissionPolicy.Prefix + PermissionCodes.ArticlesEditAnyDraft;

    [HttpGet("items")]
    [ProducesResponseType<DashboardItemsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DashboardItemsResponse>> GetItems(
        [FromQuery] string? search,
        [FromQuery] Guid? categoryId,
        [FromQuery] string? filter = "Everything",
        [FromQuery] string? sortBy = "position",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DashboardService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var result = await dashboard.GetAsync(
            search, categoryId, filter, sortBy, page, pageSize, cancellationToken);
        return Ok(new DashboardItemsResponse(
            result.Items.Select(ToResponse).ToArray(),
            result.Page,
            result.PageSize,
            result.TotalCount,
            result.ArticleCount,
            result.EverythingArticleCount,
            new DashboardFilterCountsResponse(
                result.FilterCounts.Everything,
                result.FilterCounts.Published,
                result.FilterCounts.DraftUnpublished,
                result.FilterCounts.ToReview,
                result.FilterCounts.Archived),
            result.Truncated));
    }

    [HttpPatch("categories/{id:guid}/position")]
    [Authorize(Policy = ManageCategoriesPolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ReorderCategory(Guid id, DashboardReorderRequest request,
        CancellationToken cancellationToken)
    {
        await dashboard.ReorderCategoryAsync(id, request.TargetId, request.Placement, cancellationToken);
        return NoContent();
    }

    [HttpPatch("articles/{id:guid}/position")]
    [Authorize(Policy = ReorderArticlesPolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ReorderArticle(Guid id, DashboardReorderRequest request,
        CancellationToken cancellationToken)
    {
        await dashboard.ReorderArticleAsync(id, request.TargetId, request.Placement, cancellationToken);
        return NoContent();
    }

    [HttpPost("bulk/move")]
    [ProducesResponseType<DashboardBulkActionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DashboardBulkActionResponse>> MoveBulk(
        DashboardBulkMoveRequest request,
        CancellationToken cancellationToken)
    {
        var result = await bulkActions.MoveAsync(
            request.ArticleIds, request.CategoryIds, request.DestinationCategoryId, cancellationToken);
        return Ok(new DashboardBulkActionResponse(
            result.ArticleIds.Count, result.CategoryIds.Count, result.ArticleIds, result.CategoryIds));
    }

    [HttpPost("bulk/duplicate")]
    [ProducesResponseType<DashboardBulkActionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DashboardBulkActionResponse>> DuplicateBulk(
        DashboardBulkDuplicateRequest request,
        CancellationToken cancellationToken)
    {
        var result = await bulkActions.DuplicateAsync(request.ArticleIds, request.CategoryIds, cancellationToken);
        return Ok(new DashboardBulkActionResponse(
            result.ArticleIds.Count, result.CategoryIds.Count, result.ArticleIds, result.CategoryIds));
    }

    private static DashboardItemResponse ToResponse(DashboardItemData item) => new(
        item.Kind,
        item.Id,
        item.Position,
        item.Category is null ? null : new DashboardCategoryResponse(
            item.Category.Id,
            item.Category.ParentId,
            item.Category.Name,
            item.Category.Slug,
            item.Category.Description,
            item.Category.SortOrder,
            item.Category.Path,
            item.Category.Depth,
            item.Category.ArticleCount,
            item.Category.Status,
            item.Category.Visibility),
        item.Article is null ? null : ToArticleResponse(item.Article));

    private static ArticleListItemResponse ToArticleResponse(ArticleListData article) => new(
        article.Id,
        article.Title,
        article.Slug,
        article.Status,
        article.Category is null ? null : new CategorySummaryResponse(
            article.Category.Id,
            article.Category.Name,
            article.Category.Slug,
            article.Category.Path),
        new UserSummaryResponse(article.Owner.Id, article.Owner.Name),
        article.CurrentDraftId,
        article.CurrentPublishedVersionId,
        article.CreatedAt,
        article.UpdatedAt,
        article.PublishedAt,
        article.IsCurrentDraftLocked,
        article.LockedBy is null ? null : new UserSummaryResponse(article.LockedBy.Id, article.LockedBy.Name),
        article.Position,
        article.Visibility,
        article.LegacyAuthorName,
        article.LegacyAuthorEmail,
        article.LegacyAuthorExternalId);
}
