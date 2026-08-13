using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

public partial class AddInternalSearchJobs : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey("FK_SEARCH_INDEX_JOBS_ARTICLES", "SEARCH_INDEX_JOBS");
        migrationBuilder.AlterColumn<Guid>(name: "ArticleID_FK", table: "SEARCH_INDEX_JOBS", type: "uniqueidentifier",
            nullable: true, oldClrType: typeof(Guid), oldType: "uniqueidentifier");
        migrationBuilder.AddColumn<Guid>(name: "CategoryID_FK", table: "SEARCH_INDEX_JOBS", type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<string>(name: "TargetType", table: "SEARCH_INDEX_JOBS", type: "nvarchar(30)", maxLength: 30,
            nullable: false, defaultValue: "Article");
        migrationBuilder.AddColumn<string>(name: "IndexScope", table: "SEARCH_INDEX_JOBS", type: "nvarchar(30)", maxLength: 30,
            nullable: false, defaultValue: "Internal");
        migrationBuilder.AddColumn<DateTime>(name: "AvailableAt", table: "SEARCH_INDEX_JOBS", type: "datetime2(3)",
            nullable: false, defaultValueSql: "sysutcdatetime()");
        // Legacy rows represented published/viewer semantics and are unsafe to replay into the internal collection.
        migrationBuilder.Sql("UPDATE SEARCH_INDEX_JOBS SET Status = 'Completed', ProcessedAt = COALESCE(ProcessedAt, sysutcdatetime()) WHERE Status IN ('Pending', 'Processing')");
        migrationBuilder.AddCheckConstraint("CK_SEARCH_INDEX_JOBS_Target", "SEARCH_INDEX_JOBS",
            "([TargetType] = 'Article' AND [ArticleID_FK] IS NOT NULL AND [CategoryID_FK] IS NULL) OR ([TargetType] = 'Category' AND [CategoryID_FK] IS NOT NULL AND [ArticleID_FK] IS NULL)");
        migrationBuilder.CreateIndex(name: "IX_SEARCH_INDEX_JOBS_Scope_Status_AvailableAt", table: "SEARCH_INDEX_JOBS",
            columns: new[] { "IndexScope", "Status", "AvailableAt" });
        migrationBuilder.AddForeignKey(name: "FK_SEARCH_INDEX_JOBS_ARTICLES", table: "SEARCH_INDEX_JOBS",
            column: "ArticleID_FK", principalTable: "ARTICLES", principalColumn: "ArticleID", onDelete: ReferentialAction.Cascade);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DELETE FROM SEARCH_INDEX_JOBS WHERE TargetType = 'Category'");
        migrationBuilder.DropCheckConstraint("CK_SEARCH_INDEX_JOBS_Target", "SEARCH_INDEX_JOBS");
        migrationBuilder.DropIndex("IX_SEARCH_INDEX_JOBS_Scope_Status_AvailableAt", "SEARCH_INDEX_JOBS");
        migrationBuilder.DropForeignKey("FK_SEARCH_INDEX_JOBS_ARTICLES", "SEARCH_INDEX_JOBS");
        migrationBuilder.DropColumn("AvailableAt", "SEARCH_INDEX_JOBS");
        migrationBuilder.DropColumn("CategoryID_FK", "SEARCH_INDEX_JOBS");
        migrationBuilder.DropColumn("IndexScope", "SEARCH_INDEX_JOBS");
        migrationBuilder.DropColumn("TargetType", "SEARCH_INDEX_JOBS");
        migrationBuilder.AlterColumn<Guid>(name: "ArticleID_FK", table: "SEARCH_INDEX_JOBS", type: "uniqueidentifier",
            nullable: false, defaultValue: Guid.Empty, oldClrType: typeof(Guid), oldType: "uniqueidentifier", oldNullable: true);
        migrationBuilder.AddForeignKey(name: "FK_SEARCH_INDEX_JOBS_ARTICLES", table: "SEARCH_INDEX_JOBS",
            column: "ArticleID_FK", principalTable: "ARTICLES", principalColumn: "ArticleID");
    }
}
