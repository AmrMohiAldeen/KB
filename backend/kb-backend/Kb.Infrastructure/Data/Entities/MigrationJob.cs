namespace Kb.Infrastructure.Data.Entities;

public sealed class MigrationJob
{
    public Guid Id { get; set; }
    public string Type { get; set; } = null!;
    public string Status { get; set; } = null!;
    public string OriginalFileName { get; set; } = null!;
    public string PackageStoragePath { get; set; } = null!;
    public Guid RequestedByUserId { get; set; }
    public DateTime RequestedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string CurrentPhase { get; set; } = null!;
    public int TotalItems { get; set; }
    public int ProcessedItems { get; set; }
    public int ImportedItems { get; set; }
    public int UpdatedItems { get; set; }
    public int SkippedItems { get; set; }
    public int FailedItems { get; set; }
    public string OptionsJson { get; set; } = null!;
    public bool CancellationRequested { get; set; }
    public string? ValidationSummaryJson { get; set; }
    public string? SummaryJson { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }
    public byte[] RowVersion { get; set; } = null!;
    public User RequestedByUser { get; set; } = null!;
    public ICollection<MigrationJobError> Errors { get; set; } = new List<MigrationJobError>();
    public ICollection<MigrationExternalMapping> Mappings { get; set; } = new List<MigrationExternalMapping>();
}
