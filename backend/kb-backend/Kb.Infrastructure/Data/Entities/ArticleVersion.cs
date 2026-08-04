using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ArticleVersion
{
    public Guid VersionId { get; set; }

    public Guid ArticleIdFk { get; set; }

    public int VersionNumber { get; set; }

    public Guid? SourceDraftIdFk { get; set; }

    public int? SourceDraftNumber { get; set; }

    public string SnapshotReason { get; set; } = null!;

    public string ContentJsonStoragePath { get; set; } = null!;

    public string? RenderedHtmlStoragePath { get; set; }

    public string? PlainTextStoragePath { get; set; }

    public string? ContentHash { get; set; }

    public long ContentSizeBytes { get; set; }

    public DateTime CreatedAt { get; set; }

    public Guid CreatedByFk { get; set; }

    public Guid? PublishedByFk { get; set; }

    public DateTime? PublishedAt { get; set; }

    public virtual Article ArticleIdFkNavigation { get; set; } = null!;

    public virtual ICollection<Article> Articles { get; set; } = new List<Article>();

    public virtual User CreatedByFkNavigation { get; set; } = null!;

    public virtual ICollection<ExportJob> ExportJobs { get; set; } = new List<ExportJob>();

    public virtual User? PublishedByFkNavigation { get; set; }

    public virtual ICollection<SearchIndexJob> SearchIndexJobs { get; set; } = new List<SearchIndexJob>();

    public virtual ArticleDraft? SourceDraftIdFkNavigation { get; set; }
}
