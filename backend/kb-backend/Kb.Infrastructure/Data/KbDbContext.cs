using System;
using System.Collections.Generic;
using Kb.Domain.Constants;
using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Data;

public partial class KbDbContext : DbContext
{
    public KbDbContext(DbContextOptions<KbDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Article> Articles { get; set; }

    public virtual DbSet<ArticleAuditLog> ArticleAuditLogs { get; set; }

    public virtual DbSet<ArticleComment> ArticleComments { get; set; }

    public virtual DbSet<ArticleDraft> ArticleDrafts { get; set; }

    public virtual DbSet<ArticleReviewEvent> ArticleReviewEvents { get; set; }

    public virtual DbSet<ArticleVersion> ArticleVersions { get; set; }

    public virtual DbSet<Category> Categories { get; set; }

    public virtual DbSet<ContentBlock> ContentBlocks { get; set; }

    public virtual DbSet<ExportJob> ExportJobs { get; set; }

    public virtual DbSet<MediaFile> MediaFiles { get; set; }

    public virtual DbSet<MediaReference> MediaReferences { get; set; }

    public virtual DbSet<Notification> Notifications { get; set; }

    public virtual DbSet<Role> Roles { get; set; }

    public virtual DbSet<RolePermission> RolePermissions { get; set; }

    public virtual DbSet<SearchIndexJob> SearchIndexJobs { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserRole> UserRoles { get; set; }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnsureAuditLogsAreAppendOnly();
        EnsureArticleVersionsAreAppendOnly();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        EnsureAuditLogsAreAppendOnly();
        EnsureArticleVersionsAreAppendOnly();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Article>(entity =>
        {
            entity.ToTable("ARTICLES");

            entity.HasIndex(e => e.AuthorIdFk, "IX_ARTICLES_AuthorID_FK");

            entity.HasIndex(e => e.CategoryIdFk, "IX_ARTICLES_CategoryID_FK");

            entity.HasIndex(e => new { e.CategoryIdFk, e.Position, e.Title }, "IX_ARTICLES_CategoryID_Position");

            entity.HasIndex(e => new { e.Status, e.UpdatedAt }, "IX_ARTICLES_Status").IsDescending(false, true);

            entity.HasIndex(e => e.Slug, "UX_ARTICLES_Slug_Active")
                .IsUnique()
                .HasFilter("([DeletedAt] IS NULL)");

            entity.Property(e => e.ArticleId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ARTICLES_ArticleID")
                .HasColumnName("ArticleID");
            entity.Property(e => e.AuthorIdFk).HasColumnName("AuthorID_FK");
            entity.Property(e => e.CategoryIdFk).HasColumnName("CategoryID_FK");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLES_CreatedAt");
            entity.Property(e => e.CurrentDraftIdFk).HasColumnName("CurrentDraftID_FK");
            entity.Property(e => e.DeletedAt).HasPrecision(3);
            entity.Property(e => e.LastPublishedVersionIdFk).HasColumnName("LastPublishedVersionID_FK");
            entity.Property(e => e.Position).HasDefaultValue(0, "DF_ARTICLES_Position");
            entity.Property(e => e.Slug).HasMaxLength(350);
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Draft", "DF_ARTICLES_Status");
            entity.Property(e => e.Title).HasMaxLength(300);
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLES_UpdatedAt");

            entity.HasOne(d => d.AuthorIdFkNavigation).WithMany(p => p.Articles)
                .HasForeignKey(d => d.AuthorIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLES_Author_USERS");

            entity.HasOne(d => d.CategoryIdFkNavigation).WithMany(p => p.Articles)
                .HasForeignKey(d => d.CategoryIdFk)
                .HasConstraintName("FK_ARTICLES_CATEGORIES");

            entity.HasOne(d => d.CurrentDraftIdFkNavigation).WithMany(p => p.Articles)
                .HasForeignKey(d => d.CurrentDraftIdFk)
                .HasConstraintName("FK_ARTICLES_CurrentDraft_ARTICLE_DRAFTS");

            entity.HasOne(d => d.LastPublishedVersionIdFkNavigation).WithMany(p => p.Articles)
                .HasForeignKey(d => d.LastPublishedVersionIdFk)
                .HasConstraintName("FK_ARTICLES_LastPublishedVersion_ARTICLE_VERSIONS");
        });

        modelBuilder.Entity<ArticleAuditLog>(entity =>
        {
            entity.HasKey(e => e.AuditLogId);

            entity.ToTable("ARTICLE_AUDIT_LOG");

            entity.HasIndex(e => new { e.ActionType, e.CreatedAt }, "IX_ARTICLE_AUDIT_LOG_ActionType").IsDescending(false, true);

            entity.HasIndex(e => new { e.ActorIdFk, e.CreatedAt }, "IX_ARTICLE_AUDIT_LOG_ActorID_CreatedAt").IsDescending(false, true);

            entity.HasIndex(e => new { e.ArticleIdFk, e.CreatedAt }, "IX_ARTICLE_AUDIT_LOG_ArticleID_CreatedAt").IsDescending(false, true);

            entity.Property(e => e.AuditLogId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ARTICLE_AUDIT_LOG_AuditLogID")
                .HasColumnName("AuditLogID");
            entity.Property(e => e.ActionType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.ActorIdFk).HasColumnName("ActorID_FK");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_AUDIT_LOG_CreatedAt");
            entity.Property(e => e.EntityId).HasColumnName("EntityID");
            entity.Property(e => e.EntityType).HasMaxLength(100);
            entity.Property(e => e.MetaDataJson).HasColumnName("MetaDataJSON");

            entity.HasOne(d => d.ActorIdFkNavigation).WithMany(p => p.ArticleAuditLogs)
                .HasForeignKey(d => d.ActorIdFk)
                .HasConstraintName("FK_ARTICLE_AUDIT_LOG_Actor_USERS");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.ArticleAuditLogs)
                .HasForeignKey(d => d.ArticleIdFk)
                .HasConstraintName("FK_ARTICLE_AUDIT_LOG_ARTICLES");
        });

        modelBuilder.Entity<ArticleComment>(entity =>
        {
            entity.HasKey(e => e.CommentId);

            entity.ToTable("ARTICLE_COMMENTS");

            entity.HasIndex(e => new { e.ArticleIdFk, e.Status, e.CreatedAt }, "IX_ARTICLE_COMMENTS_ArticleID_Status").IsDescending(false, false, true);

            entity.HasIndex(e => e.ParentCommentIdFk, "IX_ARTICLE_COMMENTS_ParentCommentID_FK").HasFilter("([ParentCommentID_FK] IS NOT NULL)");

            entity.HasIndex(e => e.CurrentDraftIdFk, "IX_ARTICLE_COMMENTS_CurrentDraftID_FK")
                .HasFilter("([CurrentDraftID_FK] IS NOT NULL)");

            entity.HasIndex(e => e.OriginDraftIdFk, "IX_ARTICLE_COMMENTS_OriginDraftID_FK")
                .HasFilter("([OriginDraftID_FK] IS NOT NULL)");

            entity.Property(e => e.CommentId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ARTICLE_COMMENTS_CommentID")
                .HasColumnName("CommentID");
            entity.Property(e => e.AnchorType).HasMaxLength(50);
            entity.Property(e => e.AnchorDataJson).HasColumnName("AnchorDataJSON");
            entity.Property(e => e.AnchorStatus)
                .HasMaxLength(50)
                .HasDefaultValue(CommentAnchorStatuses.Attached, "DF_ARTICLE_COMMENTS_AnchorStatus");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_COMMENTS_CreatedAt");
            entity.Property(e => e.CreatedByFk).HasColumnName("CreatedBy_FK");
            entity.Property(e => e.CurrentDraftIdFk).HasColumnName("CurrentDraftID_FK");
            entity.Property(e => e.DeletedAt).HasPrecision(3);
            entity.Property(e => e.OriginDraftIdFk).HasColumnName("OriginDraftID_FK");
            entity.Property(e => e.ParentCommentIdFk).HasColumnName("ParentCommentID_FK");
            entity.Property(e => e.ResolvedAt).HasPrecision(3);
            entity.Property(e => e.ResolvedByFk).HasColumnName("ResolvedBy_FK");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Open", "DF_ARTICLE_COMMENTS_Status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_COMMENTS_UpdatedAt");
            var commentRowVersion = entity.Property(e => e.RowVersion)
                .IsConcurrencyToken();
            if (Database.IsSqlServer())
                commentRowVersion.IsRowVersion();

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.ArticleComments)
                .HasForeignKey(d => d.ArticleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_COMMENTS_ARTICLES");

            entity.HasOne(d => d.CreatedByFkNavigation).WithMany(p => p.ArticleCommentCreatedByFkNavigations)
                .HasForeignKey(d => d.CreatedByFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_COMMENTS_CreatedBy_USERS");

            entity.HasOne(d => d.CurrentDraftIdFkNavigation).WithMany(p => p.CurrentArticleComments)
                .HasForeignKey(d => d.CurrentDraftIdFk)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS");

            entity.HasOne(d => d.ParentCommentIdFkNavigation).WithMany(p => p.InverseParentCommentIdFkNavigation)
                .HasForeignKey(d => d.ParentCommentIdFk)
                .HasConstraintName("FK_ARTICLE_COMMENTS_Parent_ARTICLE_COMMENTS");

            entity.HasOne(d => d.OriginDraftIdFkNavigation).WithMany(p => p.OriginArticleComments)
                .HasForeignKey(d => d.OriginDraftIdFk)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS");

            entity.HasOne(d => d.ResolvedByFkNavigation).WithMany(p => p.ArticleCommentResolvedByFkNavigations)
                .HasForeignKey(d => d.ResolvedByFk)
                .HasConstraintName("FK_ARTICLE_COMMENTS_ResolvedBy_USERS");
        });

        modelBuilder.Entity<ArticleDraft>(entity =>
        {
            entity.HasKey(e => e.DraftId);

            entity.ToTable("ARTICLE_DRAFTS");

            entity.HasIndex(e => new { e.ArticleIdFk, e.UpdatedAt }, "IX_ARTICLE_DRAFTS_ArticleID_FK").IsDescending(false, true);

            entity.HasIndex(e => new { e.ArticleIdFk, e.DraftNumber }, "UX_ARTICLE_DRAFTS_Article_DraftNumber").IsUnique();

            entity.HasIndex(e => e.LockedByFk, "IX_ARTICLE_DRAFTS_LockedBy_FK").HasFilter("([LockedBy_FK] IS NOT NULL)");

            entity.HasIndex(e => e.Status, "IX_ARTICLE_DRAFTS_Status");

            entity.Property(e => e.DraftId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ARTICLE_DRAFTS_DraftID")
                .HasColumnName("DraftID");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.DraftNumber)
                .HasDefaultValue(1, "DF_ARTICLE_DRAFTS_DraftNumber");
            entity.Property(e => e.ContentHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.ContentJsonStoragePath).HasMaxLength(1024);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_DRAFTS_CreatedAt");
            entity.Property(e => e.CreatedByFk).HasColumnName("CreatedBy_FK");
            entity.Property(e => e.LockedAt).HasPrecision(3);
            entity.Property(e => e.LockedByFk).HasColumnName("LockedBy_FK");
            entity.Property(e => e.PlainTextStoragePath).HasMaxLength(1024);
            entity.Property(e => e.RenderedHtmlStoragePath).HasMaxLength(1024);
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken();
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Draft", "DF_ARTICLE_DRAFTS_Status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_DRAFTS_UpdatedAt");
            entity.Property(e => e.UpdatedByFk).HasColumnName("UpdatedBy_FK");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.ArticleDrafts)
                .HasForeignKey(d => d.ArticleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_DRAFTS_ARTICLES");

            entity.HasOne(d => d.CreatedByFkNavigation).WithMany(p => p.ArticleDraftCreatedByFkNavigations)
                .HasForeignKey(d => d.CreatedByFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_DRAFTS_CreatedBy_USERS");

            entity.HasOne(d => d.LockedByFkNavigation).WithMany(p => p.ArticleDraftLockedByFkNavigations)
                .HasForeignKey(d => d.LockedByFk)
                .HasConstraintName("FK_ARTICLE_DRAFTS_LockedBy_USERS");

            entity.HasOne(d => d.UpdatedByFkNavigation).WithMany(p => p.ArticleDraftUpdatedByFkNavigations)
                .HasForeignKey(d => d.UpdatedByFk)
                .HasConstraintName("FK_ARTICLE_DRAFTS_UpdatedBy_USERS");
        });

        modelBuilder.Entity<ArticleReviewEvent>(entity =>
        {
            entity.HasKey(e => e.ReviewEventId);

            entity.ToTable("ARTICLE_REVIEW_EVENTS");

            entity.HasIndex(e => new { e.ArticleIdFk, e.CreatedAt }, "IX_ARTICLE_REVIEW_EVENTS_ArticleID_CreatedAt").IsDescending(false, true);

            entity.Property(e => e.ReviewEventId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ARTICLE_REVIEW_EVENTS_ReviewEventID")
                .HasColumnName("ReviewEventID");
            entity.Property(e => e.Action).HasMaxLength(100);
            entity.Property(e => e.ActorIdFk).HasColumnName("ActorID_FK");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_REVIEW_EVENTS_CreatedAt");
            entity.Property(e => e.DraftIdFk).HasColumnName("DraftID_FK");
            entity.Property(e => e.FromStatus).HasMaxLength(50);
            entity.Property(e => e.ToStatus).HasMaxLength(50);

            entity.HasOne(d => d.ActorIdFkNavigation).WithMany(p => p.ArticleReviewEvents)
                .HasForeignKey(d => d.ActorIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_REVIEW_EVENTS_Actor_USERS");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.ArticleReviewEvents)
                .HasForeignKey(d => d.ArticleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_REVIEW_EVENTS_ARTICLES");

            entity.HasOne(d => d.DraftIdFkNavigation).WithMany(p => p.ArticleReviewEvents)
                .HasForeignKey(d => d.DraftIdFk)
                .HasConstraintName("FK_ARTICLE_REVIEW_EVENTS_ARTICLE_DRAFTS");
        });

        modelBuilder.Entity<ArticleVersion>(entity =>
        {
            entity.HasKey(e => e.VersionId);

            entity.ToTable("ARTICLE_VERSIONS");

            entity.HasIndex(e => new { e.ArticleIdFk, e.CreatedAt }, "IX_ARTICLE_VERSIONS_ArticleID_CreatedAt").IsDescending(false, true);

            entity.HasIndex(e => new { e.ArticleIdFk, e.VersionNumber }, "UX_ARTICLE_VERSIONS_Article_VersionNumber").IsUnique();

            entity.Property(e => e.VersionId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ARTICLE_VERSIONS_VersionID")
                .HasColumnName("VersionID");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.ContentHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.ContentJsonStoragePath).HasMaxLength(1024);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_ARTICLE_VERSIONS_CreatedAt");
            entity.Property(e => e.CreatedByFk).HasColumnName("CreatedBy_FK");
            entity.Property(e => e.PlainTextStoragePath).HasMaxLength(1024);
            entity.Property(e => e.PublishedAt).HasPrecision(3);
            entity.Property(e => e.PublishedByFk).HasColumnName("PublishedBy_FK");
            entity.Property(e => e.RenderedHtmlStoragePath).HasMaxLength(1024);
            entity.Property(e => e.SnapshotReason)
                .HasMaxLength(50)
                .HasDefaultValue(ArticleSnapshotReasons.Published, "DF_ARTICLE_VERSIONS_SnapshotReason");
            entity.Property(e => e.SourceDraftIdFk).HasColumnName("SourceDraftID_FK");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.ArticleVersions)
                .HasForeignKey(d => d.ArticleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_VERSIONS_ARTICLES");

            entity.HasOne(d => d.CreatedByFkNavigation).WithMany(p => p.ArticleVersionCreatedByFkNavigations)
                .HasForeignKey(d => d.CreatedByFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ARTICLE_VERSIONS_CreatedBy_USERS");

            entity.HasOne(d => d.PublishedByFkNavigation).WithMany(p => p.ArticleVersionPublishedByFkNavigations)
                .HasForeignKey(d => d.PublishedByFk)
                .HasConstraintName("FK_ARTICLE_VERSIONS_PublishedBy_USERS");

            entity.HasOne(d => d.SourceDraftIdFkNavigation).WithMany(p => p.SourceArticleVersions)
                .HasForeignKey(d => d.SourceDraftIdFk)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("CATEGORIES");

            entity.HasIndex(e => new { e.ParentCategoryIdFk, e.SortOrder, e.Name }, "IX_CATEGORIES_ParentCategoryID_FK");

            entity.HasIndex(e => e.Slug, "UX_CATEGORIES_Slug").IsUnique();

            entity.Property(e => e.CategoryId)
                .HasDefaultValueSql("(newsequentialid())", "DF_CATEGORIES_CategoryID")
                .HasColumnName("CategoryID");
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.ParentCategoryIdFk).HasColumnName("ParentCategoryID_FK");
            entity.Property(e => e.Path).HasMaxLength(2048);
            entity.Property(e => e.Slug).HasMaxLength(250);
            entity.Property(e => e.Status)
                .HasMaxLength(40)
                .HasDefaultValue("Active", "DF_CATEGORIES_Status");

            entity.HasOne(d => d.ParentCategoryIdFkNavigation).WithMany(p => p.InverseParentCategoryIdFkNavigation)
                .HasForeignKey(d => d.ParentCategoryIdFk)
                .HasConstraintName("FK_CATEGORIES_Parent_CATEGORIES");
        });

        modelBuilder.Entity<ContentBlock>(entity =>
        {
            entity.ToTable("CONTENT_BLOCKS");

            entity.HasIndex(e => new { e.Type, e.Name }, "IX_CONTENT_BLOCKS_Type");

            entity.Property(e => e.ContentBlockId)
                .HasDefaultValueSql("(newsequentialid())", "DF_CONTENT_BLOCKS_ContentBlockID")
                .HasColumnName("ContentBlockID");
            entity.Property(e => e.ContentJsonStoragePath).HasMaxLength(1024);
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_CONTENT_BLOCKS_CreatedAt");
            entity.Property(e => e.CreatedByFk).HasColumnName("CreatedBy_FK");
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.PlainTextStoragePath).HasMaxLength(1024);
            entity.Property(e => e.RenderedHtmlStoragePath).HasMaxLength(1024);
            entity.Property(e => e.Type).HasMaxLength(80);
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_CONTENT_BLOCKS_UpdatedAt");
            entity.Property(e => e.UpdatedByFk).HasColumnName("UpdatedBy_FK");

            entity.HasOne(d => d.CreatedByFkNavigation).WithMany(p => p.ContentBlockCreatedByFkNavigations)
                .HasForeignKey(d => d.CreatedByFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_CONTENT_BLOCKS_CreatedBy_USERS");

            entity.HasOne(d => d.UpdatedByFkNavigation).WithMany(p => p.ContentBlockUpdatedByFkNavigations)
                .HasForeignKey(d => d.UpdatedByFk)
                .HasConstraintName("FK_CONTENT_BLOCKS_UpdatedBy_USERS");
        });

        modelBuilder.Entity<ExportJob>(entity =>
        {
            entity.ToTable("EXPORT_JOBS");

            entity.HasIndex(e => e.ArticleIdFk, "IX_EXPORT_JOBS_ArticleID_FK");

            entity.HasIndex(e => new { e.Status, e.RequestedAt }, "IX_EXPORT_JOBS_Status_RequestedAt");

            entity.Property(e => e.ExportJobId)
                .HasDefaultValueSql("(newsequentialid())", "DF_EXPORT_JOBS_ExportJobID")
                .HasColumnName("ExportJobID");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.ExportType).HasMaxLength(30);
            entity.Property(e => e.RequestedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_EXPORT_JOBS_RequestedAt");
            entity.Property(e => e.RequestedByFk).HasColumnName("RequestedBy_FK");
            entity.Property(e => e.ResultPath).HasMaxLength(1024);
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_EXPORT_JOBS_Status");
            entity.Property(e => e.VersionIdFk).HasColumnName("VersionID_FK");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.ExportJobs)
                .HasForeignKey(d => d.ArticleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_EXPORT_JOBS_ARTICLES");

            entity.HasOne(d => d.RequestedByFkNavigation).WithMany(p => p.ExportJobs)
                .HasForeignKey(d => d.RequestedByFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_EXPORT_JOBS_RequestedBy_USERS");

            entity.HasOne(d => d.VersionIdFkNavigation).WithMany(p => p.ExportJobs)
                .HasForeignKey(d => d.VersionIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_EXPORT_JOBS_ARTICLE_VERSIONS");
        });

        modelBuilder.Entity<MediaFile>(entity =>
        {
            entity.HasKey(e => e.MediaId);

            entity.ToTable("MEDIA_FILES");

            entity.HasIndex(e => new { e.Status, e.UploadedAt }, "IX_MEDIA_FILES_Status").IsDescending(false, true);

            entity.HasIndex(e => new { e.UploadedByFk, e.UploadedAt }, "IX_MEDIA_FILES_UploadedBy_FK").IsDescending(false, true);

            entity.Property(e => e.MediaId)
                .HasDefaultValueSql("(newsequentialid())", "DF_MEDIA_FILES_MediaID")
                .HasColumnName("MediaID");
            entity.Property(e => e.AccessUrl)
                .HasMaxLength(2048)
                .HasColumnName("AccessURL");
            entity.Property(e => e.FileExtension).HasMaxLength(30);
            entity.Property(e => e.MimeType).HasMaxLength(150);
            entity.Property(e => e.OriginalFileName).HasMaxLength(260);
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Temporary", "DF_MEDIA_FILES_Status");
            entity.Property(e => e.StoragePath).HasMaxLength(1024);
            entity.Property(e => e.StoredFileName).HasMaxLength(260);
            entity.Property(e => e.UploadedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_MEDIA_FILES_UploadedAt");
            entity.Property(e => e.UploadedByFk).HasColumnName("UploadedBy_FK");

            entity.HasOne(d => d.UploadedByFkNavigation).WithMany(p => p.MediaFiles)
                .HasForeignKey(d => d.UploadedByFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MEDIA_FILES_UploadedBy_USERS");
        });

        modelBuilder.Entity<MediaReference>(entity =>
        {
            entity.HasKey(e => e.ReferenceId);

            entity.ToTable("MEDIA_REFERENCES");

            entity.HasIndex(e => e.ArticleIdFk, "IX_MEDIA_REFERENCES_ArticleID_FK");

            entity.HasIndex(e => new { e.ReferenceEntityType, e.ReferenceEntityId }, "IX_MEDIA_REFERENCES_Entity");

            entity.HasIndex(e => e.MediaIdFk, "IX_MEDIA_REFERENCES_MediaID_FK");

            entity.Property(e => e.ReferenceId)
                .HasDefaultValueSql("(newsequentialid())", "DF_MEDIA_REFERENCES_ReferenceID")
                .HasColumnName("ReferenceID");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.MediaIdFk).HasColumnName("MediaID_FK");
            entity.Property(e => e.ReferenceEntityId).HasColumnName("ReferenceEntityID");
            entity.Property(e => e.ReferenceEntityType).HasMaxLength(100);

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.MediaReferences)
                .HasForeignKey(d => d.ArticleIdFk)
                .HasConstraintName("FK_MEDIA_REFERENCES_ARTICLES");

            entity.HasOne(d => d.MediaIdFkNavigation).WithMany(p => p.MediaReferences)
                .HasForeignKey(d => d.MediaIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MEDIA_REFERENCES_MEDIA_FILES");
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.ToTable("NOTIFICATIONS");

            entity.HasIndex(e => new { e.UserIdFk, e.IsRead, e.CreatedAt }, "IX_NOTIFICATIONS_UserID_IsRead").IsDescending(false, false, true);

            entity.Property(e => e.NotificationId)
                .HasDefaultValueSql("(newsequentialid())", "DF_NOTIFICATIONS_NotificationID")
                .HasColumnName("NotificationID");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_NOTIFICATIONS_CreatedAt");
            entity.Property(e => e.ReadAt).HasPrecision(3);
            entity.Property(e => e.Title).HasMaxLength(250);
            entity.Property(e => e.Type).HasMaxLength(80);
            entity.Property(e => e.UserIdFk).HasColumnName("UserID_FK");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.ArticleIdFk)
                .HasConstraintName("FK_NOTIFICATIONS_ARTICLES");

            entity.HasOne(d => d.UserIdFkNavigation).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.UserIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_NOTIFICATIONS_USERS");
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("ROLES");

            entity.HasIndex(e => e.RoleName, "UX_ROLES_RoleName").IsUnique();

            entity.Property(e => e.RoleId)
                .HasDefaultValueSql("(newsequentialid())", "DF_ROLES_RoleID")
                .HasColumnName("RoleID");
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.RoleName).HasMaxLength(100);
        });

        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.HasKey(e => new { e.RoleIdFk, e.PermissionCode });

            entity.ToTable("ROLE_PERMISSIONS");

            entity.Property(e => e.RoleIdFk).HasColumnName("RoleID_FK");
            entity.Property(e => e.PermissionCode).HasMaxLength(150);

            entity.HasOne(d => d.RoleIdFkNavigation).WithMany(p => p.RolePermissions)
                .HasForeignKey(d => d.RoleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ROLE_PERMISSIONS_ROLES");
        });

        modelBuilder.Entity<SearchIndexJob>(entity =>
        {
            entity.HasKey(e => e.SearchJobId);

            entity.ToTable("SEARCH_INDEX_JOBS");

            entity.HasIndex(e => e.ArticleIdFk, "IX_SEARCH_INDEX_JOBS_ArticleID_FK");

            entity.HasIndex(e => new { e.Status, e.CreatedAt }, "IX_SEARCH_INDEX_JOBS_Status_CreatedAt");

            entity.Property(e => e.SearchJobId)
                .HasDefaultValueSql("(newsequentialid())", "DF_SEARCH_INDEX_JOBS_SearchJobID")
                .HasColumnName("SearchJobID");
            entity.Property(e => e.ArticleIdFk).HasColumnName("ArticleID_FK");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_SEARCH_INDEX_JOBS_CreatedAt");
            entity.Property(e => e.JobType).HasMaxLength(50);
            entity.Property(e => e.ProcessedAt).HasPrecision(3);
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_SEARCH_INDEX_JOBS_Status");
            entity.Property(e => e.VersionIdFk).HasColumnName("VersionID_FK");

            entity.HasOne(d => d.ArticleIdFkNavigation).WithMany(p => p.SearchIndexJobs)
                .HasForeignKey(d => d.ArticleIdFk)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SEARCH_INDEX_JOBS_ARTICLES");

            entity.HasOne(d => d.VersionIdFkNavigation).WithMany(p => p.SearchIndexJobs)
                .HasForeignKey(d => d.VersionIdFk)
                .HasConstraintName("FK_SEARCH_INDEX_JOBS_ARTICLE_VERSIONS");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("USERS");

            entity.HasIndex(e => e.Email, "UX_USERS_Email").IsUnique();

            entity.HasIndex(e => e.SsoId, "UX_USERS_SsoID")
                .IsUnique()
                .HasFilter("([SsoID] IS NOT NULL)");

            entity.Property(e => e.UserId)
                .HasDefaultValueSql("(newsequentialid())", "DF_USERS_UserID")
                .HasColumnName("UserID");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_USERS_CreatedAt");
            entity.Property(e => e.Email).HasMaxLength(320);
            entity.Property(e => e.FullName).HasMaxLength(200);
            entity.Property(e => e.IsActive).HasDefaultValue(true, "DF_USERS_IsActive");
            entity.Property(e => e.LastLoginAt).HasPrecision(3);
            entity.Property(e => e.SsoId)
                .HasMaxLength(256)
                .HasColumnName("SsoID");
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.RoleId });

            entity.ToTable("USER_ROLES");

            entity.HasIndex(e => e.RoleId, "IX_USER_ROLES_RoleID");

            entity.Property(e => e.UserId).HasColumnName("UserID");
            entity.Property(e => e.RoleId).HasColumnName("RoleID");
            entity.Property(e => e.AssignedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysutcdatetime())", "DF_USER_ROLES_AssignedAt");
            entity.Property(e => e.AssignedByFk).HasColumnName("AssignedBy_FK");

            entity.HasOne(d => d.AssignedByFkNavigation).WithMany(p => p.UserRoleAssignedByFkNavigations)
                .HasForeignKey(d => d.AssignedByFk)
                .HasConstraintName("FK_USER_ROLES_AssignedBy_USERS");

            entity.HasOne(d => d.Role).WithMany(p => p.UserRoles)
                .HasForeignKey(d => d.RoleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_USER_ROLES_ROLES");

            entity.HasOne(d => d.User).WithMany(p => p.UserRoleUsers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_USER_ROLES_USERS");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    private void EnsureAuditLogsAreAppendOnly()
    {
        if (ChangeTracker.Entries<ArticleAuditLog>()
            .Any(entry => entry.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Audit logs are append-only and cannot be edited or deleted.");
    }

    private void EnsureArticleVersionsAreAppendOnly()
    {
        if (ChangeTracker.Entries<ArticleVersion>().Any(entry =>
                entry.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Article versions are immutable and cannot be modified or deleted.");
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
