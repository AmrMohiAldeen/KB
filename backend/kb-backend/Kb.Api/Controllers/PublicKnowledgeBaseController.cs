using Kb.Application.Public;
using Kb.Contracts.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/kb")]
public sealed class PublicKnowledgeBaseController(PublicKnowledgeBaseService knowledgeBase) : ControllerBase
{
    [HttpGet("categories/tree")]
    public async Task<ActionResult<IReadOnlyList<PublicCategoryNodeResponse>>> Categories(
        CancellationToken cancellationToken) => Ok((await knowledgeBase.GetTreeAsync(cancellationToken))
        .Select(Map).ToArray());

    [HttpGet("articles")]
    public async Task<ActionResult<IReadOnlyList<PublicArticleSummaryResponse>>> Articles(
        [FromQuery] string? search, [FromQuery] Guid? categoryId, CancellationToken cancellationToken) =>
        Ok((await knowledgeBase.GetArticlesAsync(search, categoryId, cancellationToken)).Select(article =>
            new PublicArticleSummaryResponse(article.Id, article.Title, article.Slug, article.CategoryId,
                article.CategoryName, article.CategoryPath, article.UpdatedAt)).ToArray());

    [HttpGet("articles/{slug}")]
    [ProducesResponseType<PublicArticleResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicArticleResponse>> Article(string slug, CancellationToken cancellationToken)
    {
        var article = await knowledgeBase.GetArticleBySlugAsync(slug, cancellationToken);
        return Ok(new PublicArticleResponse(article.Id, article.Title, article.Slug, article.CategoryId,
            article.CategoryName, article.CategoryPath, article.UpdatedAt, article.Content));
    }

    private static PublicCategoryNodeResponse Map(PublicCategoryNode category) => new(category.Id,
        category.ParentId, category.Name, category.Slug, category.Description, category.SortOrder, category.Path,
        category.Depth, category.ArticleCount, category.Children.Select(Map).ToArray());
}
