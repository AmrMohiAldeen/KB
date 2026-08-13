using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260813120000_AddExportJobSources")]
public sealed class AddExportJobSources : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql(Sql);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        DELETE FROM dbo.EXPORT_JOBS WHERE SourceType=N'Draft';
        IF OBJECT_ID(N'dbo.CK_EXPORT_JOBS_Target', N'C') IS NOT NULL
            ALTER TABLE dbo.EXPORT_JOBS DROP CONSTRAINT CK_EXPORT_JOBS_Target;
        IF OBJECT_ID(N'dbo.FK_EXPORT_JOBS_ARTICLE_DRAFTS', N'F') IS NOT NULL
            ALTER TABLE dbo.EXPORT_JOBS DROP CONSTRAINT FK_EXPORT_JOBS_ARTICLE_DRAFTS;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EXPORT_JOBS') AND name=N'IX_EXPORT_JOBS_DraftID_FK')
            DROP INDEX IX_EXPORT_JOBS_DraftID_FK ON dbo.EXPORT_JOBS;
        ALTER TABLE dbo.EXPORT_JOBS DROP COLUMN DraftID_FK, SourceType;
        ALTER TABLE dbo.EXPORT_JOBS WITH CHECK ADD CONSTRAINT CK_EXPORT_JOBS_Target CHECK
            ((EntityType=N'Article' AND ArticleID_FK IS NOT NULL AND VersionID_FK IS NOT NULL AND CategoryID_FK IS NULL)
             OR (EntityType=N'Category' AND CategoryID_FK IS NOT NULL AND ArticleID_FK IS NULL AND VersionID_FK IS NULL));
        """);

    internal const string Sql = """
        IF COL_LENGTH('dbo.EXPORT_JOBS', 'DraftID_FK') IS NULL
            ALTER TABLE dbo.EXPORT_JOBS ADD DraftID_FK uniqueidentifier NULL;
        IF COL_LENGTH('dbo.EXPORT_JOBS', 'SourceType') IS NULL
            ALTER TABLE dbo.EXPORT_JOBS ADD SourceType nvarchar(30) NULL;

        UPDATE dbo.EXPORT_JOBS
        SET SourceType=N'Version'
        WHERE EntityType=N'Article' AND SourceType IS NULL AND VersionID_FK IS NOT NULL;

        IF OBJECT_ID(N'dbo.CK_EXPORT_JOBS_Target', N'C') IS NOT NULL
            ALTER TABLE dbo.EXPORT_JOBS DROP CONSTRAINT CK_EXPORT_JOBS_Target;
        IF OBJECT_ID(N'dbo.FK_EXPORT_JOBS_ARTICLE_DRAFTS', N'F') IS NULL
            ALTER TABLE dbo.EXPORT_JOBS WITH CHECK ADD CONSTRAINT FK_EXPORT_JOBS_ARTICLE_DRAFTS
                FOREIGN KEY (DraftID_FK) REFERENCES dbo.ARTICLE_DRAFTS(DraftID);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EXPORT_JOBS') AND name=N'IX_EXPORT_JOBS_DraftID_FK')
            CREATE INDEX IX_EXPORT_JOBS_DraftID_FK ON dbo.EXPORT_JOBS(DraftID_FK);
        ALTER TABLE dbo.EXPORT_JOBS WITH CHECK ADD CONSTRAINT CK_EXPORT_JOBS_Target CHECK
            ((EntityType=N'Article' AND ArticleID_FK IS NOT NULL AND CategoryID_FK IS NULL AND
              ((SourceType=N'Draft' AND DraftID_FK IS NOT NULL AND VersionID_FK IS NULL) OR
               (SourceType=N'Version' AND VersionID_FK IS NOT NULL AND DraftID_FK IS NULL)))
             OR
             (EntityType=N'Category' AND CategoryID_FK IS NOT NULL AND ArticleID_FK IS NULL AND
              SourceType IS NULL AND DraftID_FK IS NULL AND VersionID_FK IS NULL));
        """;
}
