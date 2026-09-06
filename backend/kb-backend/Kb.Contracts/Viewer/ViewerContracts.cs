using System.Text.Json;

namespace Kb.Contracts.Viewer;

public sealed record ViewerHandoffExchangeRequest(string Token);
public sealed record ViewerSolutionResponse(Guid SolutionId, string Slug);
public sealed record ViewerSessionResponse(Guid SessionId, Guid CustomerId, string ExternalUserId,
    string ExternalUserEmail, DateTime ExpiresAt, IReadOnlyList<ViewerSolutionResponse> Solutions);
public sealed record ViewerDashboardAppearanceResponse(string PrimaryColor, string PageBackgroundColor,
    string CategoryCardBackgroundColor, string TextColor);
public sealed record UpdateViewerDashboardAppearanceRequest(string PrimaryColor, string PageBackgroundColor,
    string CategoryCardBackgroundColor, string TextColor);
public sealed record ViewerDashboardCategoryCustomizationResponse(Guid CategoryId, int SortOrder,
    Guid? ViewerImageMediaId, string? ViewerIcon, string DisplayColor);
public sealed record ViewerDashboardCustomizationResponse(Guid RootCategoryId, ViewerDashboardAppearanceResponse Appearance,
    IReadOnlyList<ViewerDashboardCategoryCustomizationResponse> Categories);
public sealed record UpdateViewerDashboardCustomizationRequest(ViewerDashboardAppearanceResponse Appearance,
    IReadOnlyList<ViewerDashboardCategoryCustomizationResponse> Categories);
public sealed record ViewerLanguageResponse(string LocaleCode, string DisplayName, string NativeName,
    bool IsDefault, bool IsRtl);
public sealed record ViewerPortalResponse(Guid SolutionId, string Slug, string Name, string? Description,
    ViewerLanguageResponse ActiveLanguage, IReadOnlyList<ViewerLanguageResponse> Languages,
    ViewerDashboardAppearanceResponse Appearance);
public sealed record ViewerCategoryNodeResponse(Guid CategoryId, Guid? ParentCategoryId, string Name, string Slug,
    string? Description, int SortOrder, string? Path, int Depth, int ArticleCount,
    IReadOnlyList<ViewerCategoryNodeResponse> Children, bool HasViewerImage, string? ViewerIcon, string? DisplayColor = null);
public sealed record ViewerArticleSummaryResponse(Guid ArticleId, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt);
public sealed record ViewerArticleTranslationResponse(Guid ArticleId, string LocaleCode, string Slug);
public sealed record ViewerArticleResponse(Guid ArticleId, string Title, string Slug, Guid CategoryId,
    string CategoryName, string CategoryPath, DateTime UpdatedAt, JsonElement Content,
    ViewerLanguageResponse ActiveLanguage, IReadOnlyList<ViewerLanguageResponse> Languages,
    IReadOnlyList<ViewerArticleTranslationResponse> AvailableTranslations);
