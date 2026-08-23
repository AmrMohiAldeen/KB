using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class Article
{
    public Guid ArticleId { get; set; }

    public string Title { get; set; } = null!;

    public string Slug { get; set; } = null!;

    public Guid? CategoryIdFk { get; set; }

    public Guid AuthorIdFk { get; set; }

    public string Status { get; set; } = null!;

    public string Visibility { get; set; } = "Public";

    public int Position { get; set; }

    public Guid? CurrentDraftIdFk { get; set; }

    public Guid? LastPublishedVersionIdFk { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<ArticleAuditLog> ArticleAuditLogs { get; set; } = new List<ArticleAuditLog>();

    public virtual ICollection<ArticleCategory> ArticleCategories { get; set; } = new List<ArticleCategory>();

    public virtual ICollection<ArticleComment> ArticleComments { get; set; } = new List<ArticleComment>();

    public virtual ICollection<ArticleNotificationPreference> ArticleNotificationPreferences { get; set; } = new List<ArticleNotificationPreference>();

    public virtual ICollection<ArticleDraft> ArticleDrafts { get; set; } = new List<ArticleDraft>();

    public virtual ICollection<ArticleReviewEvent> ArticleReviewEvents { get; set; } = new List<ArticleReviewEvent>();

    public virtual ICollection<ArticleVersion> ArticleVersions { get; set; } = new List<ArticleVersion>();

    public virtual User AuthorIdFkNavigation { get; set; } = null!;

    public virtual Category? CategoryIdFkNavigation { get; set; }

    public virtual ArticleDraft? CurrentDraftIdFkNavigation { get; set; }

    public virtual ICollection<ExportJob> ExportJobs { get; set; } = new List<ExportJob>();

    public virtual ArticleVersion? LastPublishedVersionIdFkNavigation { get; set; }

    public virtual ICollection<MediaReference> MediaReferences { get; set; } = new List<MediaReference>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<SearchIndexJob> SearchIndexJobs { get; set; } = new List<SearchIndexJob>();
}
