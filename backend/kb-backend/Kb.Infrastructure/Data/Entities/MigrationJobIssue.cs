namespace Kb.Infrastructure.Data.Entities;

public sealed class MigrationJobIssue
{
    public Guid MigrationIssueId { get; set; }
    public Guid MigrationJobIdFk { get; set; }
    public string Severity { get; set; } = null!;
    public string? FileName { get; set; }
    public int? RowNumber { get; set; }
    public string? ExternalEntityType { get; set; }
    public string? ExternalId { get; set; }
    public string ErrorCode { get; set; } = null!;
    public string Message { get; set; } = null!;
    public string? SourceDataSummary { get; set; }
    public DateTime CreatedAt { get; set; }
    public MigrationJob MigrationJobIdFkNavigation { get; set; } = null!;
}
