using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class ArticleComment
{
    public Guid CommentId { get; set; }

    public Guid ArticleIdFk { get; set; }

    public Guid? ParentCommentIdFk { get; set; }

    public string Body { get; set; } = null!;

    public Guid? CurrentDraftIdFk { get; set; }

    public Guid? OriginDraftIdFk { get; set; }

    public string? AnchorType { get; set; }

    public string? AnchorDataJson { get; set; }

    public string AnchorStatus { get; set; } = null!;

    public string Status { get; set; } = null!;

    public Guid CreatedByFk { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public Guid? ResolvedByFk { get; set; }

    public DateTime? ResolvedAt { get; set; }

    public DateTime? DeletedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual Article ArticleIdFkNavigation { get; set; } = null!;

    public virtual User CreatedByFkNavigation { get; set; } = null!;

    public virtual ArticleDraft? CurrentDraftIdFkNavigation { get; set; }

    public virtual ICollection<ArticleComment> InverseParentCommentIdFkNavigation { get; set; } = new List<ArticleComment>();

    public virtual ArticleComment? ParentCommentIdFkNavigation { get; set; }

    public virtual ArticleDraft? OriginDraftIdFkNavigation { get; set; }

    public virtual User? ResolvedByFkNavigation { get; set; }
}
