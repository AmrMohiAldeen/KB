using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class User
{
    public Guid UserId { get; set; }

    public string? SsoId { get; set; }

    public string Email { get; set; } = null!;

    public string FullName { get; set; } = null!;

    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? LastLoginAt { get; set; }

    public virtual ICollection<ArticleAuditLog> ArticleAuditLogs { get; set; } = new List<ArticleAuditLog>();

    public virtual ICollection<ArticleComment> ArticleCommentCreatedByFkNavigations { get; set; } = new List<ArticleComment>();

    public virtual ICollection<ArticleComment> ArticleCommentResolvedByFkNavigations { get; set; } = new List<ArticleComment>();

    public virtual ICollection<ArticleNotificationPreference> ArticleNotificationPreferences { get; set; } = new List<ArticleNotificationPreference>();

    public virtual ICollection<ArticleDraft> ArticleDraftCreatedByFkNavigations { get; set; } = new List<ArticleDraft>();

    public virtual ICollection<ArticleDraft> ArticleDraftLockedByFkNavigations { get; set; } = new List<ArticleDraft>();

    public virtual ICollection<ArticleDraft> ArticleDraftUpdatedByFkNavigations { get; set; } = new List<ArticleDraft>();

    public virtual ICollection<ArticleReviewEvent> ArticleReviewEvents { get; set; } = new List<ArticleReviewEvent>();

    public virtual ICollection<ArticleVersion> ArticleVersionCreatedByFkNavigations { get; set; } = new List<ArticleVersion>();

    public virtual ICollection<ArticleVersion> ArticleVersionPublishedByFkNavigations { get; set; } = new List<ArticleVersion>();

    public virtual ICollection<Article> Articles { get; set; } = new List<Article>();

    public virtual ICollection<ContentBlock> ContentBlockCreatedByFkNavigations { get; set; } = new List<ContentBlock>();

    public virtual ICollection<ContentBlock> ContentBlockUpdatedByFkNavigations { get; set; } = new List<ContentBlock>();

    public virtual ICollection<ExportJob> ExportJobs { get; set; } = new List<ExportJob>();

    public virtual ICollection<MediaFile> MediaFiles { get; set; } = new List<MediaFile>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<UserRole> UserRoleAssignedByFkNavigations { get; set; } = new List<UserRole>();

    public virtual ICollection<UserRole> UserRoleUsers { get; set; } = new List<UserRole>();
}
