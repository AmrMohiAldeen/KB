namespace Kb.Infrastructure.Data.Entities;

public sealed class MigrationExternalMapping
{
    public Guid MappingId { get; set; }
    public string SourceSystem { get; set; } = null!;
    public string ExternalEntityType { get; set; } = null!;
    public string ExternalId { get; set; } = null!;
    public Guid InternalId { get; set; }
    public string? ContentHash { get; set; }
    public string? MetadataJson { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
