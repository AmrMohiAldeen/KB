using System.ComponentModel.DataAnnotations;
using Kb.Contracts.Common;

namespace Kb.Contracts.Categories;

public abstract class CategoryWriteRequest
{
    [Required, NonWhiteSpace, StringLength(200)]
    public required string Name { get; init; }

    [NonWhiteSpace, StringLength(1000)]
    public string? Description { get; init; }

    [Range(0, int.MaxValue)]
    public int SortOrder { get; init; }

    [NonWhiteSpace, StringLength(250)]
    public string? Slug { get; init; }

    [NonEmptyGuid]
    public Guid? ViewerImageMediaId { get; init; }

    [NonWhiteSpace, StringLength(50)]
    public string? ViewerIcon { get; init; }

}

public sealed class CreateCategoryRequest : CategoryWriteRequest
{
    [NonEmptyGuid]
    public Guid? ParentCategoryId { get; init; }

    [Required, RegularExpression("^(Public|Internal)$")]
    public string Visibility { get; init; } = "Public";
}

public sealed class UpdateCategoryRequest : CategoryWriteRequest
{
    [RegularExpression("^(Public|Internal)$")]
    public string? Visibility { get; init; }
}

public sealed class MoveCategoryRequest
{
    [NonEmptyGuid]
    public Guid? ParentCategoryId { get; init; }

    [Range(0, int.MaxValue)]
    public int SortOrder { get; init; }
}

public sealed class UpdateCategoryLocalizationsRequest
{
    [Required]
    public IReadOnlyList<CategoryLocalizationWriteRequest> Localizations { get; init; } = [];
}

public sealed class CategoryLocalizationWriteRequest
{
    [Required, NonWhiteSpace, StringLength(35)]
    public required string LocaleCode { get; init; }

    [StringLength(200)]
    public string? Name { get; init; }

    [StringLength(1000)]
    public string? Description { get; init; }
}

public sealed record CategoryLocalizationResponse(string LocaleCode, string Name, string? Description);
public sealed record CategoryLocalizationLanguageResponse(string LocaleCode, string DisplayName, string NativeName,
    bool IsDefault, bool IsRtl, int SortOrder);

public sealed record CategoryTreeNodeResponse(
    Guid CategoryId,
    Guid? ParentCategoryId,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    string? Path,
    int Depth,
    int ArticleCount,
    IReadOnlyList<CategoryTreeNodeResponse> Children,
    string Status,
    string Visibility,
    Guid? ViewerImageMediaId,
    string? ViewerIcon,
    IReadOnlyList<CategoryLocalizationResponse> Localizations);

public sealed record CategoryDetailsResponse(
    Guid Id,
    Guid? ParentCategoryId,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    string? Path,
    int Depth,
    int ArticleCount,
    string Status,
    string Visibility,
    Guid? ViewerImageMediaId,
    string? ViewerIcon,
    IReadOnlyList<CategoryLocalizationResponse> Localizations);
