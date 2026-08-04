using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class SearchIndexJob
{
    public Guid SearchJobId { get; set; }

    public Guid ArticleIdFk { get; set; }

    public Guid? VersionIdFk { get; set; }

    public string JobType { get; set; } = null!;

    public string Status { get; set; } = null!;

    public int RetryCount { get; set; }

    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ProcessedAt { get; set; }

    public virtual Article ArticleIdFkNavigation { get; set; } = null!;

    public virtual ArticleVersion? VersionIdFkNavigation { get; set; }
}
