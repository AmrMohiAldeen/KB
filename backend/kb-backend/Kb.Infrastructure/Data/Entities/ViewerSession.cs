namespace Kb.Infrastructure.Data.Entities;

public sealed class ViewerSession
{
    public Guid SessionId { get; set; }
    public Guid CustomerIdFk { get; set; }
    public string ExternalUserId { get; set; } = null!;
    public string ExternalUserEmail { get; set; } = null!;
    public string HandoffId { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevokedReason { get; set; }
    public ViewerCustomer Customer { get; set; } = null!;
    public ICollection<ViewerSessionSolution> Solutions { get; set; } = new List<ViewerSessionSolution>();
}
