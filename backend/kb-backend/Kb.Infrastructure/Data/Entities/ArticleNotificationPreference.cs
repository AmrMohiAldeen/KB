namespace Kb.Infrastructure.Data.Entities;

public sealed class ArticleNotificationPreference
{
    public Guid UserIdFk { get; set; }
    public Guid ArticleIdFk { get; set; }
    public bool IsEnabled { get; set; }
    public DateTime UpdatedAt { get; set; }
    public User UserIdFkNavigation { get; set; } = null!;
    public Article ArticleIdFkNavigation { get; set; } = null!;
}
