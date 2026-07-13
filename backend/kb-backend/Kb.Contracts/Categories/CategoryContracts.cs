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
}

public sealed class CreateCategoryRequest : CategoryWriteRequest
{
    [NonEmptyGuid]
    public Guid? ParentCategoryId { get; init; }
}

public sealed class UpdateCategoryRequest : CategoryWriteRequest;

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
    IReadOnlyList<CategoryTreeNodeResponse> Children);
