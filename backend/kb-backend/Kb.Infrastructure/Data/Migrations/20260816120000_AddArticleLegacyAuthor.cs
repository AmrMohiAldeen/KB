using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260816120000_AddArticleLegacyAuthor")]
public sealed class AddArticleLegacyAuthor : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorName') IS NULL
                ALTER TABLE dbo.ARTICLES ADD LegacyAuthorName nvarchar(300) NULL;
            IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorEmail') IS NULL
                ALTER TABLE dbo.ARTICLES ADD LegacyAuthorEmail nvarchar(320) NULL;
            IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorExternalId') IS NULL
                ALTER TABLE dbo.ARTICLES ADD LegacyAuthorExternalId nvarchar(100) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorName') IS NOT NULL
                ALTER TABLE dbo.ARTICLES DROP COLUMN LegacyAuthorName;
            IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorEmail') IS NOT NULL
                ALTER TABLE dbo.ARTICLES DROP COLUMN LegacyAuthorEmail;
            IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorExternalId') IS NOT NULL
                ALTER TABLE dbo.ARTICLES DROP COLUMN LegacyAuthorExternalId;
            """);
    }
}
