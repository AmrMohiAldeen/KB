using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260803150000_DropHelpJuiceMigrationTables")]
public sealed class DropHelpJuiceMigrationTables : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.MIGRATION_EXTERNAL_MAPPINGS', N'U') IS NOT NULL
                DROP TABLE dbo.MIGRATION_EXTERNAL_MAPPINGS;

            IF OBJECT_ID(N'dbo.MIGRATION_JOB_ERRORS', N'U') IS NOT NULL
                DROP TABLE dbo.MIGRATION_JOB_ERRORS;

            IF OBJECT_ID(N'dbo.MIGRATION_JOBS', N'U') IS NOT NULL
                DROP TABLE dbo.MIGRATION_JOBS;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally irreversible: the removed one-time migration tables must not be recreated.
    }
}
