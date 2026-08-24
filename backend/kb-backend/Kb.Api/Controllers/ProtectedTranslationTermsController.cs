using Kb.Application.Authorization;
using Kb.Application.Translations;
using Kb.Contracts.Translations;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize(Policy = PermissionPolicy.Prefix + PermissionCodes.LanguagesManage)]
[Route("api/protected-translation-terms")]
public sealed class ProtectedTranslationTermsController(ProtectedTranslationTermService terms) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProtectedTranslationTermResponse>>> GetAll(CancellationToken ct) =>
        Ok((await terms.GetAllAsync(ct)).Select(ToResponse).ToArray());

    [HttpPost]
    public async Task<ActionResult<ProtectedTranslationTermResponse>> Create(
        CreateProtectedTranslationTermRequest request, CancellationToken ct)
    {
        var item = await terms.CreateAsync(new(request.Term, request.LocaleCode, request.IsEnabled,
            request.Metadata), ct);
        return CreatedAtAction(nameof(GetAll), ToResponse(item));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProtectedTranslationTermResponse>> Update(Guid id,
        UpdateProtectedTranslationTermRequest request, CancellationToken ct) =>
        Ok(ToResponse(await terms.UpdateAsync(id, new(request.Term, request.LocaleCode, request.IsEnabled,
            request.Metadata), ct)));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    { await terms.DeleteAsync(id, ct); return NoContent(); }

    private static ProtectedTranslationTermResponse ToResponse(ProtectedTranslationTermData x) =>
        new(x.Id, x.Term, x.LocaleCode, x.IsEnabled, x.MetadataJson, x.CreatedAt, x.UpdatedAt);
}
