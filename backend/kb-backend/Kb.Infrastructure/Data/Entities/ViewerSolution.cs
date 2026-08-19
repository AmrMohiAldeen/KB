namespace Kb.Infrastructure.Data.Entities;

public sealed class ViewerSolution
{
    public Guid SolutionId { get; set; }
    public Guid RootCategoryIdFk { get; set; }
    public string Slug { get; set; } = null!;
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Category RootCategory { get; set; } = null!;
    public ICollection<ViewerEntitlement> Entitlements { get; set; } = new List<ViewerEntitlement>();
}
