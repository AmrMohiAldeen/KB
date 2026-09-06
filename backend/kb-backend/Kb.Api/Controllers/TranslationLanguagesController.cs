using Kb.Application.Authorization;
using Kb.Application.Languages;
using Kb.Contracts.Languages;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

// Editors need target-language metadata to create translations, but must not be able
// to change the global language configuration.
[ApiController]
[Authorize(Policy = PermissionPolicy.Prefix + PermissionCodes.ArticlesTranslate)]
[Route("api/languages/translation-targets")]
public sealed class TranslationLanguagesController(LanguageService languages) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TranslationLanguageResponse>>> GetEnabled(CancellationToken ct) =>
        Ok((await languages.GetEnabledForTranslationAsync(ct)).Select(ToResponse).ToArray());

    private static TranslationLanguageResponse ToResponse(LanguageData x) => new(x.LocaleCode, x.DisplayName,
        x.NativeName, x.IsRtl);
}
