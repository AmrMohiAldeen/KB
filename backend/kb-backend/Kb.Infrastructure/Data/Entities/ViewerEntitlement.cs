namespace Kb.Infrastructure.Data.Entities;

public sealed class ViewerEntitlement
{
    public Guid CustomerIdFk { get; set; }
    public Guid SolutionIdFk { get; set; }
    public DateTime CreatedAt { get; set; }
    public ViewerCustomer Customer { get; set; } = null!;
    public ViewerSolution Solution { get; set; } = null!;
}
