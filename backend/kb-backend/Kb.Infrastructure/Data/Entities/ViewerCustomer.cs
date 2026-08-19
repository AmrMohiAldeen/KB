namespace Kb.Infrastructure.Data.Entities;

public sealed class ViewerCustomer
{
    public Guid CustomerId { get; set; }
    public string ExternalCustomerId { get; set; } = null!;
    public string? DisplayName { get; set; }
    public int MaxConcurrentSessions { get; set; } = 10;
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<ViewerEntitlement> Entitlements { get; set; } = new List<ViewerEntitlement>();
    public ICollection<ViewerSession> Sessions { get; set; } = new List<ViewerSession>();
}
