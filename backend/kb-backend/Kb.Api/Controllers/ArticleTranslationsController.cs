using Kb.Application.Authorization;
using Kb.Application.Translations;
using Kb.Contracts.Translations;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize(Policy = PermissionPolicy.Prefix + PermissionCodes.ArticlesTranslate)]
[Route("api/articles/{articleId:guid}/translations")]
public sealed class ArticleTranslationsController(ArticleTranslationService translations) : ControllerBase
{
    [HttpGet] public async Task<ActionResult<IReadOnlyList<ArticleTranslationResponse>>> GetAll(Guid articleId, CancellationToken ct) => Ok((await translations.GetAllAsync(articleId, ct)).Select(ToResponse).ToArray());
    [HttpPost] public async Task<ActionResult<ArticleTranslationResponse>> Create(Guid articleId, CreateArticleTranslationRequest request, CancellationToken ct) { var item = await translations.CreateAsync(articleId, new(request.LocaleCode, request.Title, request.CategoryId, request.CategoryIds, request.Slug, request.Visibility, request.AssignedTranslatorUserId), ct); return CreatedAtAction(nameof(GetAll), new { articleId }, ToResponse(item)); }
    [HttpPost("link")] public async Task<ActionResult<ArticleTranslationResponse>> Link(Guid articleId, LinkArticleTranslationRequest request, CancellationToken ct) => Ok(ToResponse(await translations.LinkAsync(articleId, request.ArticleId, ct)));
    [HttpPost("unlink")] public async Task<IActionResult> Unlink(Guid articleId, CancellationToken ct) { await translations.UnlinkAsync(articleId, ct); return NoContent(); }
    [HttpPut("translator")] public async Task<ActionResult<ArticleTranslationResponse>> Assign(Guid articleId, AssignTranslatorRequest request, CancellationToken ct) => Ok(ToResponse(await translations.AssignAsync(articleId, request.TranslatorUserId, ct)));
    [HttpPost("verify")] public async Task<ActionResult<ArticleTranslationResponse>> Verify(Guid articleId, CancellationToken ct) => Ok(ToResponse(await translations.VerifyAsync(articleId, ct)));
    private static ArticleTranslationResponse ToResponse(ArticleTranslationData x) => new(x.ArticleId, x.TranslationGroupId, x.LocaleCode, x.Title, x.Slug, x.WorkflowStatus, x.TranslationStatus, x.TranslationMethod, x.SourceArticleId, x.SourceVersionId, x.SourceVersionNumber, x.AssignedTranslatorUserId, x.LastTranslatedAt, x.VerifiedAt, x.VerifiedByUserId);
}
