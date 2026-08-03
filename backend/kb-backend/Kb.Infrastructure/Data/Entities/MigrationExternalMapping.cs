namespace Kb.Infrastructure.Data.Entities;

public sealed class MigrationExternalMapping
{
    public Guid Id { get; set; }
    public Guid MigrationJobId { get; set; }
    public string SourceSystem { get; set; } = null!;
    public string ExternalEntityType { get; set; } = null!;
    public string ExternalId { get; set; } = null!;
    public Guid InternalEntityId { get; set; }
    public string? MetadataJson { get; set; }
    public DateTime CreatedAt { get; set; }
    public MigrationJob MigrationJob { get; set; } = null!;
}
