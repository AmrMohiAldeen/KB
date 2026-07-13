using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class MediaReference
{
    public Guid ReferenceId { get; set; }

    public Guid MediaIdFk { get; set; }

    public Guid? ArticleIdFk { get; set; }

    public string ReferenceEntityType { get; set; } = null!;

    public Guid ReferenceEntityId { get; set; }

    public virtual Article? ArticleIdFkNavigation { get; set; }

    public virtual MediaFile MediaIdFkNavigation { get; set; } = null!;
}
