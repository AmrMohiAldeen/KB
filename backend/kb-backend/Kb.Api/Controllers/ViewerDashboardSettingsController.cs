using Kb.Application.Authorization;
using Kb.Application.Viewer;
using Kb.Contracts.Viewer;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]
[Authorize(Policy = PermissionPolicy.Prefix + PermissionCodes.CategoriesManage)]
[Route("api/viewer-dashboard-settings")]
public sealed class ViewerDashboardSettingsController(ViewerDashboardSettingsService settings) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ViewerDashboardAppearanceResponse>> Get(CancellationToken cancellationToken)
    {
        var appearance = await settings.GetAsync(cancellationToken);
        return Ok(Map(appearance));
    }

    [HttpPut]
    public async Task<ActionResult<ViewerDashboardAppearanceResponse>> Update(
        UpdateViewerDashboardAppearanceRequest request, CancellationToken cancellationToken)
    {
        var appearance = await settings.UpdateAsync(new(request.PrimaryColor, request.PageBackgroundColor,
            request.CategoryCardBackgroundColor, request.TextColor), cancellationToken);
        return Ok(Map(appearance));
    }

    private static ViewerDashboardAppearanceResponse Map(ViewerDashboardAppearanceData value) => new(
        value.PrimaryColor, value.PageBackgroundColor, value.CategoryCardBackgroundColor, value.TextColor);
}
