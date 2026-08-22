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
    string? ViewerIcon);

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
    string? ViewerIcon);
