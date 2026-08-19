namespace Kb.Infrastructure.Data.Entities;

public sealed class ViewerSessionSolution
{
    public Guid SessionIdFk { get; set; }
    public Guid SolutionIdFk { get; set; }
    public ViewerSession Session { get; set; } = null!;
    public ViewerSolution Solution { get; set; } = null!;
}
