using Kb.Application.Authorization;
using Kb.Application.Categories;
using Kb.Application.Exceptions;
using Kb.Contracts.Categories;
using Kb.Domain.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers;

[ApiController]


// [Authorize]
[Route("api/categories")]
[AllowAnonymous]
public sealed class CategoriesController(CategoryService categories) : ControllerBase
{
    private const string ManagePolicy = PermissionPolicy.Prefix + PermissionCodes.CategoriesManage;

    [HttpGet("tree")]
    [ProducesResponseType<IReadOnlyList<CategoryTreeNodeResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CategoryTreeNodeResponse>>> GetTree(CancellationToken cancellationToken)
    {
        var tree = await categories.GetTreeAsync(cancellationToken);
        return Ok(tree.Select(ToTreeResponse).ToArray());
    }

    [HttpGet("{id:guid}", Name = nameof(GetById))]
    [ProducesResponseType<CategoryDetailsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CategoryDetailsResponse>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var category = await categories.GetAsync(id, cancellationToken)
            ?? throw new NotFoundException("The category was not found.");
        return Ok(ToDetailsResponse(category));
    }

    [HttpPost]
    [AllowAnonymous]

    // [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<CategoryDetailsResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<CategoryDetailsResponse>> Create(CreateCategoryRequest request, CancellationToken cancellationToken)
    {
        var created = await categories.CreateAsync(
            new(request.ParentCategoryId, request.Name, request.Description, request.SortOrder), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, ToDetailsResponse(created));
    }

    [HttpPut("{id:guid}")]
    [AllowAnonymous]

    // [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<CategoryDetailsResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<CategoryDetailsResponse>> Update(Guid id, UpdateCategoryRequest request,
        CancellationToken cancellationToken)
    {
        var updated = await categories.UpdateAsync(id,
            new(request.Name, request.Description, request.SortOrder), cancellationToken);
        return Ok(ToDetailsResponse(updated));
    }

    [HttpPatch("{id:guid}/move")]
    [AllowAnonymous]

    // [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType<CategoryDetailsResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<CategoryDetailsResponse>> Move(Guid id, MoveCategoryRequest request,
        CancellationToken cancellationToken)
    {
        var moved = await categories.MoveAsync(id, new(request.ParentCategoryId, request.SortOrder), cancellationToken);
        return Ok(ToDetailsResponse(moved));
    }

    [HttpDelete("{id:guid}")]
    [AllowAnonymous]
    // [Authorize(Policy = ManagePolicy)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await categories.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    private static CategoryDetailsResponse ToDetailsResponse(CategoryData category) => new(category.Id,
        category.ParentCategoryId, category.Name, category.Slug, category.Description, category.SortOrder,
        category.Path, category.Depth);

    private static CategoryTreeNodeResponse ToTreeResponse(CategoryTreeNode category) => new(category.Id,
        category.ParentCategoryId, category.Name, category.Slug, category.Description, category.SortOrder,
        category.Path, category.Depth, category.Children.Select(ToTreeResponse).ToArray());
}
