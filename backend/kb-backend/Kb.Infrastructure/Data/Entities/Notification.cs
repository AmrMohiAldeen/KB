using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class Notification
{
    public Guid NotificationId { get; set; }

    public Guid? ArticleIdFk { get; set; }

    public Guid UserIdFk { get; set; }

    public string Type { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string? Body { get; set; }

    public bool IsRead { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ReadAt { get; set; }

    public virtual Article? ArticleIdFkNavigation { get; set; }

    public virtual User UserIdFkNavigation { get; set; } = null!;
}
