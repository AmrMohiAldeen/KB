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

    [HttpGet("{rootCategoryId:guid}")]
    public async Task<ActionResult<ViewerDashboardCustomizationResponse>> GetCustomization(Guid rootCategoryId,
        CancellationToken cancellationToken) => Ok(Map(await settings.GetCustomizationAsync(rootCategoryId, cancellationToken)));

    [HttpPut("{rootCategoryId:guid}")]
    public async Task<ActionResult<ViewerDashboardCustomizationResponse>> UpdateCustomization(Guid rootCategoryId,
        UpdateViewerDashboardCustomizationRequest request, CancellationToken cancellationToken) =>
        Ok(Map(await settings.UpdateCustomizationAsync(rootCategoryId, new(rootCategoryId,
            new(request.Appearance.PrimaryColor, request.Appearance.PageBackgroundColor,
                request.Appearance.CategoryCardBackgroundColor, request.Appearance.TextColor),
            request.Categories.Select(item => new ViewerDashboardCategoryCustomizationData(item.CategoryId,
                item.SortOrder, item.ViewerImageMediaId, item.ViewerIcon, item.DisplayColor)).ToArray()), cancellationToken)));

    private static ViewerDashboardAppearanceResponse Map(ViewerDashboardAppearanceData value) => new(
        value.PrimaryColor, value.PageBackgroundColor, value.CategoryCardBackgroundColor, value.TextColor);
    private static ViewerDashboardCustomizationResponse Map(ViewerDashboardCustomizationData value) => new(value.RootCategoryId,
        Map(value.Appearance), value.Categories.Select(item => new ViewerDashboardCategoryCustomizationResponse(item.CategoryId,
            item.SortOrder, item.ViewerImageMediaId, item.ViewerIcon, item.DisplayColor)).ToArray());
}
