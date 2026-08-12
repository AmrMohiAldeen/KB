using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ExportJob
{
    public Guid ExportJobId { get; set; }

    public Guid? ArticleIdFk { get; set; }

    public Guid? VersionIdFk { get; set; }

    public Guid? CategoryIdFk { get; set; }

    public string EntityType { get; set; } = null!;

    public string ExportType { get; set; } = null!;

    public string Status { get; set; } = null!;

    public Guid RequestedByFk { get; set; }

    public DateTime RequestedAt { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public string SnapshotJson { get; set; } = null!;

    public string FileName { get; set; } = null!;

    public string? ResultPath { get; set; }

    public string? ErrorMessage { get; set; }

    public virtual Article? ArticleIdFkNavigation { get; set; }

    public virtual Category? CategoryIdFkNavigation { get; set; }

    public virtual User RequestedByFkNavigation { get; set; } = null!;

    public virtual ArticleVersion? VersionIdFkNavigation { get; set; }
}
