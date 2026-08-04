using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260802120000_AddArticlePosition")]
public sealed class AddArticlePosition : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Some environments may already have run the original standalone SQL script.
        // Keep this migration idempotent so EF can adopt those databases safely.
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.ARTICLES', 'Position') IS NULL
            BEGIN
                ALTER TABLE dbo.ARTICLES
                    ADD Position int NOT NULL
                        CONSTRAINT DF_ARTICLES_Position DEFAULT (0);

                ;WITH RankedArticles AS
                (
                    SELECT ArticleID,
                           ROW_NUMBER() OVER
                           (
                               PARTITION BY CategoryID_FK
                               ORDER BY CreatedAt, ArticleID
                           ) - 1 AS Position
                    FROM dbo.ARTICLES
                )
                UPDATE articles
                SET Position = ranked.Position
                FROM dbo.ARTICLES AS articles
                INNER JOIN RankedArticles AS ranked ON ranked.ArticleID = articles.ArticleID;
            END;

            IF NOT EXISTS
            (
                SELECT 1
                FROM sys.indexes
                WHERE name = 'IX_ARTICLES_CategoryID_Position'
                  AND object_id = OBJECT_ID('dbo.ARTICLES')
            )
            BEGIN
                CREATE INDEX IX_ARTICLES_CategoryID_Position
                    ON dbo.ARTICLES (CategoryID_FK, Position, Title);
            END;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS
            (
                SELECT 1
                FROM sys.indexes
                WHERE name = 'IX_ARTICLES_CategoryID_Position'
                  AND object_id = OBJECT_ID('dbo.ARTICLES')
            )
                DROP INDEX IX_ARTICLES_CategoryID_Position ON dbo.ARTICLES;

            IF COL_LENGTH('dbo.ARTICLES', 'Position') IS NOT NULL
            BEGIN
                DECLARE @defaultConstraint sysname;
                SELECT @defaultConstraint = constraints.name
                FROM sys.default_constraints AS constraints
                INNER JOIN sys.columns AS columns
                    ON columns.default_object_id = constraints.object_id
                WHERE constraints.parent_object_id = OBJECT_ID('dbo.ARTICLES')
                  AND columns.name = 'Position';

                IF @defaultConstraint IS NOT NULL
                    EXEC(N'ALTER TABLE dbo.ARTICLES DROP CONSTRAINT ' + QUOTENAME(@defaultConstraint));

                ALTER TABLE dbo.ARTICLES DROP COLUMN Position;
            END;
            """);
    }
}
