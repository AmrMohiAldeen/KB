using Kb.Application.Authorization;
using Kb.Application.Languages;
using Kb.Contracts.Languages;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize(Policy = PermissionPolicy.Prefix + PermissionCodes.LanguagesManage)]
[Route("api/languages")]
public sealed class LanguagesController(LanguageService languages) : ControllerBase
{
    [HttpGet] public async Task<ActionResult<IReadOnlyList<LanguageResponse>>> GetAll(CancellationToken ct) => Ok((await languages.GetAllAsync(ct)).Select(ToResponse).ToArray());
    [HttpPost] public async Task<ActionResult<LanguageResponse>> Create(CreateLanguageRequest request, CancellationToken ct) { var item = await languages.CreateAsync(new(request.LocaleCode, request.DisplayName, request.NativeName, request.IsRtl, request.SortOrder), ct); return CreatedAtAction(nameof(GetAll), ToResponse(item)); }
    [HttpPut("{id:guid}")] public async Task<ActionResult<LanguageResponse>> Update(Guid id, UpdateLanguageRequest request, CancellationToken ct) => Ok(ToResponse(await languages.UpdateAsync(id, new(request.DisplayName, request.NativeName, request.IsRtl, request.SortOrder), ct)));
    [HttpPost("{id:guid}/enable")] public async Task<ActionResult<LanguageResponse>> Enable(Guid id, CancellationToken ct) => Ok(ToResponse(await languages.SetEnabledAsync(id, true, ct)));
    [HttpPost("{id:guid}/disable")] public async Task<ActionResult<LanguageResponse>> Disable(Guid id, CancellationToken ct) => Ok(ToResponse(await languages.SetEnabledAsync(id, false, ct)));
    [HttpPost("{id:guid}/default")] public async Task<ActionResult<LanguageResponse>> SetDefault(Guid id, CancellationToken ct) => Ok(ToResponse(await languages.SetDefaultAsync(id, ct)));
    private static LanguageResponse ToResponse(LanguageData x) => new(x.Id, x.LocaleCode, x.DisplayName, x.NativeName, x.IsDefault, x.IsEnabled, x.IsRtl, x.SortOrder, x.CreatedAt, x.UpdatedAt);
}
