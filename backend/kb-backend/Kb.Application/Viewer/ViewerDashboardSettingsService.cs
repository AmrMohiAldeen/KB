using Kb.Application.Abstractions;
using Kb.Application.Exceptions;

namespace Kb.Application.Viewer;

public sealed class ViewerDashboardSettingsService(IViewerRepository repository, ICurrentUser currentUser,
    TimeProvider timeProvider)
{
    public Task<ViewerDashboardAppearanceData> GetAsync(CancellationToken cancellationToken) =>
        repository.GetAppearanceAsync(cancellationToken);

    public Task<ViewerDashboardCustomizationData> GetCustomizationAsync(Guid rootCategoryId,
        CancellationToken cancellationToken) => repository.GetDashboardCustomizationAsync(rootCategoryId, cancellationToken);

    public Task<ViewerDashboardAppearanceData> UpdateAsync(ViewerDashboardAppearanceData appearance,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        Validate(appearance);
        return repository.SaveAppearanceAsync(appearance, timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
    }

    public Task<ViewerDashboardCustomizationData> UpdateCustomizationAsync(Guid rootCategoryId,
        ViewerDashboardCustomizationData customization, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated) throw new UnauthorizedAccessException();
        if (rootCategoryId != customization.RootCategoryId) throw new BusinessRuleException("The dashboard root is invalid.");
        Validate(customization.Appearance);
        if (customization.Categories.Any(item => item.SortOrder < 0 || !IsHexColor(item.DisplayColor)))
            throw new BusinessRuleException("Category display values are invalid.");
        return repository.SaveDashboardCustomizationAsync(customization, timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
    }

    private static void Validate(ViewerDashboardAppearanceData appearance)
    {
        if (!IsHexColor(appearance.PrimaryColor) || !IsHexColor(appearance.PageBackgroundColor) ||
            !IsHexColor(appearance.CategoryCardBackgroundColor) || !IsHexColor(appearance.TextColor))
            throw new BusinessRuleException("Viewer dashboard colors must be six-digit hex values.");
    }

    private static bool IsHexColor(string? value) => value is { Length: 7 } && value[0] == '#' &&
        value[1..].All(character => char.IsAsciiHexDigit(character));
}
