using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ArticleReviewEvent
{
    public Guid ReviewEventId { get; set; }

    public Guid ArticleIdFk { get; set; }

    public Guid? DraftIdFk { get; set; }

    public string? FromStatus { get; set; }

    public string ToStatus { get; set; } = null!;

    public string Action { get; set; } = null!;

    public Guid ActorIdFk { get; set; }

    public string? Comment { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User ActorIdFkNavigation { get; set; } = null!;

    public virtual Article ArticleIdFkNavigation { get; set; } = null!;

    public virtual ArticleDraft? DraftIdFkNavigation { get; set; }
}
