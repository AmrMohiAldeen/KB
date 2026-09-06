using Kb.Application.Articles;
using Kb.Application.Authorization;
using Kb.Contracts.Articles;
using Kb.Contracts.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/articles")]
public sealed class ArticlesController(ArticleService articles) : ControllerBase
{
    private const string CreatePolicy = PermissionPolicy.Prefix + PermissionCodes.ArticlesCreate;
    private const string DeletePolicy = PermissionPolicy.Prefix + PermissionCodes.ArticlesDelete;

    [HttpGet]
    [ProducesResponseType<PagedResponse<ArticleListItemResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<PagedResponse<ArticleListItemResponse>>> GetList(
        [FromQuery] string? search, [FromQuery] Guid? categoryId, [FromQuery] string? status,
        [FromQuery] Guid? ownerId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = ArticleService.DefaultPageSize, [FromQuery] string? sortBy = "updatedAt",
        [FromQuery] string? sortDirection = "desc", CancellationToken cancellationToken = default)
    {
        var result = await articles.GetPagedAsync(search, categoryId, status, ownerId, page, pageSize,
            sortBy, sortDirection, cancellationToken);
        return Ok(new PagedResponse<ArticleListItemResponse>(result.Items.Select(ToListResponse).ToArray(),
            result.Page, result.PageSize, result.TotalCount));
    }

    [HttpGet("{id:guid}", Name = "GetArticleById")]
    [ProducesResponseType<ArticleDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ArticleDetailsResponse>> GetById(Guid id, CancellationToken cancellationToken)
        => Ok(ToDetailsResponse(await articles.GetAsync(id, cancellationToken)));

    [HttpGet("by-slug/{slug}")]
    [ProducesResponseType<ArticleDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ArticleDetailsResponse>> GetBySlug(
        string slug,
        CancellationToken cancellationToken) =>
        Ok(ToDetailsResponse(await articles.GetBySlugAsync(slug, cancellationToken)));

    [HttpPost]
    [Authorize(Policy = CreatePolicy)]
    [ProducesResponseType<ArticleDetailsResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ArticleDetailsResponse>> Create(CreateArticleRequest request,
        CancellationToken cancellationToken)
    {
        var created = await articles.CreateAsync(
            new(request.Title, request.CategoryId, request.Slug, request.Visibility, request.CategoryIds), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, ToDetailsResponse(created));
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType<ArticleDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ArticleDetailsResponse>> Update(Guid id, UpdateArticleMetadataRequest request,
        CancellationToken cancellationToken)
    {
        var updated = await articles.UpdateAsync(id,
            new(request.Title, request.CategoryId, request.Slug, Convert.FromBase64String(request.RowVersion),
                request.Visibility, request.CategoryIds),
            cancellationToken);
        return Ok(ToDetailsResponse(updated));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = DeletePolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await articles.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    private static ArticleListItemResponse ToListResponse(ArticleListData article) => new(article.Id,
        article.Title, article.Slug, article.Status, ToCategory(article.Category), ToUser(article.Owner),
        article.CurrentDraftId, article.CurrentPublishedVersionId, article.CreatedAt, article.UpdatedAt,
        article.PublishedAt, article.IsCurrentDraftLocked, ToOptionalUser(article.LockedBy), article.Position,
        article.Visibility, article.Categories?.Select(category => ToCategory(category)!).ToArray(),
        article.TranslationStatus, article.SourceVersionNumber, article.CurrentSourceVersionNumber,
        article.IsTranslationCurrent);

    private static ArticleDetailsResponse ToDetailsResponse(ArticleData article) => new(article.Id,
        article.Title, article.Slug, article.Status, ToCategory(article.Category), ToUser(article.Owner),
        article.CurrentDraft is null ? null : new ArticleDraftMetadataResponse(article.CurrentDraft.Id,
            article.CurrentDraft.ContentHash, article.CurrentDraft.ContentSizeBytes,
            Convert.ToBase64String(article.CurrentDraft.RowVersion), article.CurrentDraft.Status,
            article.CurrentDraft.IsLocked, ToOptionalUser(article.CurrentDraft.LockedBy), article.CurrentDraft.LockedAt,
            ToUser(article.CurrentDraft.CreatedBy), ToOptionalUser(article.CurrentDraft.UpdatedBy),
            article.CurrentDraft.CreatedAt, article.CurrentDraft.UpdatedAt),
        article.CurrentPublishedVersion is null ? null : new ArticlePublishedVersionMetadataResponse(
            article.CurrentPublishedVersion.Id, article.CurrentPublishedVersion.Number,
            article.CurrentPublishedVersion.ContentHash,
            article.CurrentPublishedVersion.ContentSizeBytes, ToUser(article.CurrentPublishedVersion.CreatedBy),
            article.CurrentPublishedVersion.CreatedAt, ToOptionalUser(article.CurrentPublishedVersion.PublishedBy),
            article.CurrentPublishedVersion.PublishedAt), article.CreatedAt, article.UpdatedAt,
        article.SubmittedAt, article.ApprovedAt, article.PublishedAt, article.Visibility,
        article.Categories?.Select(category => ToCategory(category)!).ToArray());

    private static CategorySummaryResponse? ToCategory(CategoryReference? category) => category is null
        ? null : new(category.Id, category.Name, category.Slug, category.Path);
    private static UserSummaryResponse ToUser(UserReference user) => new(user.Id, user.Name);
    private static UserSummaryResponse? ToOptionalUser(UserReference? user) => user is null ? null : ToUser(user);
}
