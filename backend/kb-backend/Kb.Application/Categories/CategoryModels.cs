namespace Kb.Application.Categories;

public sealed record CategoryData(Guid Id, Guid? ParentCategoryId, string Name, string Slug, string? Description, int SortOrder, string? Path, int Depth, int ArticleCount = 0, string Status = "Active", string Visibility = "Public", Guid? ViewerImageMediaId = null, string? ViewerIcon = null);
public sealed record CategoryTreeNode(Guid Id, Guid? ParentCategoryId, string Name, string Slug, string? Description, int SortOrder, string? Path, int Depth, int ArticleCount, IReadOnlyList<CategoryTreeNode> Children, string Status = "Active", string Visibility = "Public", Guid? ViewerImageMediaId = null, string? ViewerIcon = null);
public sealed record CreateCategoryCommand(Guid? ParentCategoryId, string Name, string? Description, int SortOrder, string? Slug = null, string Visibility = "Public", Guid? ViewerImageMediaId = null, string? ViewerIcon = null);
public sealed record UpdateCategoryCommand(string Name, string? Description, int SortOrder, string? Slug = null, string? Visibility = null, Guid? ViewerImageMediaId = null, string? ViewerIcon = null);
public sealed record MoveCategoryCommand(Guid? ParentCategoryId, int SortOrder);
public sealed record NewCategoryData(Guid? ParentCategoryId, string Name, string Slug, string? Description, int SortOrder, int Depth, string Visibility = "Public", Guid? ViewerImageMediaId = null, string? ViewerIcon = null);
public sealed record HierarchyUpdate(Guid Id, Guid? ParentCategoryId, string Path, int Depth, int SortOrder);
public sealed record AuditData(Guid ActorId, string Action, string MetadataJson, DateTime CreatedAt);
