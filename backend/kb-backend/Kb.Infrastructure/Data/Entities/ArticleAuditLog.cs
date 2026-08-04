using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ArticleAuditLog
{
    public Guid AuditLogId { get; set; }

    public Guid? ArticleIdFk { get; set; }

    public Guid? ActorIdFk { get; set; }

    public string ActionType { get; set; } = null!;

    public string? EntityType { get; set; }

    public Guid? EntityId { get; set; }

    public string? MetaDataJson { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User? ActorIdFkNavigation { get; set; }

    public virtual Article? ArticleIdFkNavigation { get; set; }
}
