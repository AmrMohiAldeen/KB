using Kb.Infrastructure.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kb.Infrastructure.Data;

public partial class KbDbContext
{
    public DbSet<MigrationJob> MigrationJobs => Set<MigrationJob>();
    public DbSet<MigrationJobError> MigrationJobErrors => Set<MigrationJobError>();
    public DbSet<MigrationExternalMapping> MigrationExternalMappings => Set<MigrationExternalMapping>();

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MigrationJob>(entity =>
        {
            entity.ToTable("MIGRATION_JOBS");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("MigrationJobID");
            entity.Property(x => x.Type).HasMaxLength(50);
            entity.Property(x => x.Status).HasMaxLength(50);
            entity.Property(x => x.OriginalFileName).HasMaxLength(260);
            entity.Property(x => x.PackageStoragePath).HasMaxLength(1024);
            entity.Property(x => x.CurrentPhase).HasMaxLength(100);
            entity.Property(x => x.OptionsJson).HasColumnName("OptionsJSON");
            entity.Property(x => x.ValidationSummaryJson).HasColumnName("ValidationSummaryJSON");
            entity.Property(x => x.SummaryJson).HasColumnName("SummaryJSON");
            entity.Property(x => x.FailureCode).HasMaxLength(100);
            entity.Property(x => x.FailureMessage).HasMaxLength(4000);
            var rowVersion = entity.Property(x => x.RowVersion).IsConcurrencyToken();
            if (Database.IsSqlServer()) rowVersion.IsRowVersion();
            entity.HasIndex(x => new { x.Status, x.RequestedAt });
            entity.HasOne(x => x.RequestedByUser).WithMany()
                .HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MigrationJobError>(entity =>
        {
            entity.ToTable("MIGRATION_JOB_ERRORS");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("MigrationJobErrorID");
            if (Database.IsSqlServer()) entity.Property(x => x.Id).HasDefaultValueSql("(newsequentialid())");
            entity.Property(x => x.Severity).HasMaxLength(20);
            entity.Property(x => x.FileName).HasMaxLength(260);
            entity.Property(x => x.ExternalEntityType).HasMaxLength(100);
            entity.Property(x => x.ExternalId).HasMaxLength(500);
            entity.Property(x => x.ErrorCode).HasMaxLength(100);
            entity.Property(x => x.Message).HasMaxLength(4000);
            entity.Property(x => x.SourceDataSummary).HasMaxLength(4000);
            entity.HasIndex(x => new { x.MigrationJobId, x.Severity, x.CreatedAt });
            entity.HasOne(x => x.MigrationJob).WithMany(x => x.Errors)
                .HasForeignKey(x => x.MigrationJobId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MigrationExternalMapping>(entity =>
        {
            entity.ToTable("MIGRATION_EXTERNAL_MAPPINGS");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("MigrationExternalMappingID");
            if (Database.IsSqlServer()) entity.Property(x => x.Id).HasDefaultValueSql("(newsequentialid())");
            entity.Property(x => x.SourceSystem).HasMaxLength(50);
            entity.Property(x => x.ExternalEntityType).HasMaxLength(100);
            entity.Property(x => x.ExternalId).HasMaxLength(500);
            entity.HasIndex(x => new { x.MigrationJobId, x.ExternalEntityType, x.ExternalId }).IsUnique();
            entity.HasOne(x => x.MigrationJob).WithMany(x => x.Mappings)
                .HasForeignKey(x => x.MigrationJobId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
