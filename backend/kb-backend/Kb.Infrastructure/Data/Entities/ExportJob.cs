using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ExportJob
{
    public Guid ExportJobId { get; set; }

    public Guid ArticleIdFk { get; set; }

    public Guid VersionIdFk { get; set; }

    public string ExportType { get; set; } = null!;

    public string Status { get; set; } = null!;

    public Guid RequestedByFk { get; set; }

    public DateTime RequestedAt { get; set; }

    public string? ResultPath { get; set; }

    public string? ErrorMessage { get; set; }

    public virtual Article ArticleIdFkNavigation { get; set; } = null!;

    public virtual User RequestedByFkNavigation { get; set; } = null!;

    public virtual ArticleVersion VersionIdFkNavigation { get; set; } = null!;
}
