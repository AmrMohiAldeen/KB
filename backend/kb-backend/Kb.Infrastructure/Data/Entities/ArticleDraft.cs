using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ArticleDraft
{
    public Guid DraftId { get; set; }

    public Guid ArticleIdFk { get; set; }

    public int DraftNumber { get; set; }

    public string ContentJsonStoragePath { get; set; } = null!;

    public string? RenderedHtmlStoragePath { get; set; }

    public string? PlainTextStoragePath { get; set; }

    public string? ContentHash { get; set; }

    public long ContentSizeBytes { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public bool IsLocked { get; set; }

    public Guid? LockedByFk { get; set; }

    public DateTime? LockedAt { get; set; }

    public Guid CreatedByFk { get; set; }

    public Guid? UpdatedByFk { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string Status { get; set; } = null!;

    public virtual Article ArticleIdFkNavigation { get; set; } = null!;

    public virtual ICollection<ArticleReviewEvent> ArticleReviewEvents { get; set; } = new List<ArticleReviewEvent>();

    public virtual ICollection<ArticleComment> CurrentArticleComments { get; set; } = new List<ArticleComment>();

    public virtual ICollection<ArticleComment> OriginArticleComments { get; set; } = new List<ArticleComment>();

    public virtual ICollection<Article> Articles { get; set; } = new List<Article>();

    public virtual User CreatedByFkNavigation { get; set; } = null!;

    public virtual User? LockedByFkNavigation { get; set; }

    public virtual User? UpdatedByFkNavigation { get; set; }

    public virtual ICollection<ArticleVersion> SourceArticleVersions { get; set; } = new List<ArticleVersion>();
}
