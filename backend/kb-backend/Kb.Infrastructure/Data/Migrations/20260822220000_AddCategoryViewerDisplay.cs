using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260822220000_AddCategoryViewerDisplay")]
public sealed class AddCategoryViewerDisplay : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "ViewerImageMediaID_FK",
            table: "CATEGORIES",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ViewerIcon",
            table: "CATEGORIES",
            type: "nvarchar(50)",
            maxLength: 50,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_CATEGORIES_ViewerImageMediaID_FK",
            table: "CATEGORIES",
            column: "ViewerImageMediaID_FK");

        migrationBuilder.AddForeignKey(
            name: "FK_CATEGORIES_ViewerImage_MEDIA_FILES",
            table: "CATEGORIES",
            column: "ViewerImageMediaID_FK",
            principalTable: "MEDIA_FILES",
            principalColumn: "MediaID",
            onDelete: ReferentialAction.SetNull);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey("FK_CATEGORIES_ViewerImage_MEDIA_FILES", "CATEGORIES");
        migrationBuilder.DropIndex("IX_CATEGORIES_ViewerImageMediaID_FK", "CATEGORIES");
        migrationBuilder.DropColumn("ViewerImageMediaID_FK", "CATEGORIES");
        migrationBuilder.DropColumn("ViewerIcon", "CATEGORIES");
    }
}
