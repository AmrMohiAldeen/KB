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
public sealed class ArticleTranslationsController(ArticleTranslationService translations,
    AutomaticArticleTranslationService automaticTranslations,
    LocalizationSynchronizationService synchronization) : ControllerBase
{
    [HttpGet] public async Task<ActionResult<IReadOnlyList<ArticleTranslationResponse>>> GetAll(Guid articleId, CancellationToken ct) => Ok((await translations.GetAllAsync(articleId, ct)).Select(ToResponse).ToArray());
    [HttpPost] public async Task<ActionResult<ArticleTranslationResponse>> Create(Guid articleId, CreateArticleTranslationRequest request, CancellationToken ct) { var item = await translations.CreateAsync(articleId, new(request.LocaleCode, request.Title, request.CategoryId, request.CategoryIds, request.Slug, request.Visibility, request.AssignedTranslatorUserId), ct); return CreatedAtAction(nameof(GetAll), new { articleId }, ToResponse(item)); }
    [HttpPost("unlink")] public async Task<IActionResult> Unlink(Guid articleId, CancellationToken ct) { await translations.UnlinkAsync(articleId, ct); return NoContent(); }
    [HttpPut("translator")] public async Task<ActionResult<ArticleTranslationResponse>> Assign(Guid articleId, AssignTranslatorRequest request, CancellationToken ct) => Ok(ToResponse(await translations.AssignAsync(articleId, request.TranslatorUserId, ct)));
    [HttpPost("verify")] public async Task<ActionResult<ArticleTranslationResponse>> Verify(Guid articleId, CancellationToken ct) => Ok(ToResponse(await translations.VerifyAsync(articleId, ct)));
    [HttpPost("{targetArticleId:guid}/automatic")]
    public async Task<ActionResult<AutomaticArticleTranslationResponse>> Automatic(Guid articleId,
        Guid targetArticleId, CancellationToken ct)
    {
        var value = await automaticTranslations.TranslateAsync(articleId, targetArticleId, ct);
        return Ok(new AutomaticArticleTranslationResponse(value.SourceArticleId, value.TargetArticleId, value.TargetDraftId,
            value.SourceLocaleCode, value.TargetLocaleCode, value.TranslatedTitle,
            value.TranslatedSegmentCount, value.TranslationMethod, value.TranslationStatus, value.TranslatedAt));
    }
    [HttpPost("sync/preview")]
    public async Task<ActionResult<LocalizationSyncPreviewResponse>> PreviewSync(Guid articleId,
        LocalizationSyncRequest request, CancellationToken ct)
    {
        var value = await synchronization.PreviewAsync(articleId,
            new(request.TargetLocaleCodes, request.Scope, request.Mode), ct);
        return Ok(new LocalizationSyncPreviewResponse(value.SourceArticleId, value.SourceLocaleCode,
            value.SourceVersionId, value.SourceVersionNumber, value.Scope, value.Mode,
            value.Items.Select(x => new LocalizationSyncPreviewItemResponse(x.TargetLocaleCode,
                x.TargetArticleId, x.State, x.Operation, x.MayReplaceManualDraftContent)).ToArray()));
    }
    [HttpPost("sync")]
    public async Task<ActionResult<LocalizationSyncResultResponse>> Synchronize(Guid articleId,
        LocalizationSyncRequest request, CancellationToken ct)
    {
        var value = await synchronization.SynchronizeAsync(articleId,
            new(request.TargetLocaleCodes, request.Scope, request.Mode), ct);
        return Ok(new LocalizationSyncResultResponse(value.SourceArticleId, value.SourceVersionId,
            value.SourceVersionNumber, value.Outcomes.Select(x => new LocalizationSyncOutcomeResponse(
                x.TargetLocaleCode, x.TargetArticleId, x.Operation, x.Outcome, x.TargetDraftId,
                x.TranslationStatus, x.Error)).ToArray()));
    }
    private static ArticleTranslationResponse ToResponse(ArticleTranslationData x) => new(x.ArticleId, x.TranslationGroupId, x.LocaleCode, x.Title, x.Slug, x.WorkflowStatus, x.TranslationStatus, x.TranslationMethod, x.SourceArticleId, x.SourceVersionId, x.SourceVersionNumber, x.AssignedTranslatorUserId, x.LastTranslatedAt, x.VerifiedAt, x.VerifiedByUserId, x.CurrentSourceVersionId, x.CurrentSourceVersionNumber, x.IsCurrent);
}
