namespace Kb.Infrastructure.Data.Entities;

public sealed class MigrationJobError
{
    public Guid Id { get; set; }
    public Guid MigrationJobId { get; set; }
    public string Severity { get; set; } = null!;
    public string? FileName { get; set; }
    public int? RowNumber { get; set; }
    public string? ExternalEntityType { get; set; }
    public string? ExternalId { get; set; }
    public string ErrorCode { get; set; } = null!;
    public string Message { get; set; } = null!;
    public string? SourceDataSummary { get; set; }
    public DateTime CreatedAt { get; set; }
    public MigrationJob MigrationJob { get; set; } = null!;
}
