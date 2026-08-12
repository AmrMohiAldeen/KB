namespace Kb.Infrastructure.Data.Entities;

public sealed class MigrationJob
{
    public Guid MigrationJobId { get; set; }
    public string SourceSystem { get; set; } = null!;
    public string PackageHash { get; set; } = null!;
    public string Status { get; set; } = null!;
    public Guid RequestedByFk { get; set; }
    public string? OptionsJson { get; set; }
    public string? SummaryJson { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public User RequestedByFkNavigation { get; set; } = null!;
    public ICollection<MigrationJobIssue> Issues { get; set; } = new List<MigrationJobIssue>();
}
