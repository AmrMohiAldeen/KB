using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260824110000_AddViewerDashboardCustomizations")]
public sealed class AddViewerDashboardCustomizations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(name: "VIEWER_DASHBOARD_CUSTOMIZATIONS", columns: table => new
        {
            RootCategoryID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            PrimaryColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
            PageBackgroundColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
            CategoryCardBackgroundColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
            TextColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
            UpdatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_DASHBOARD_CUSTOMIZATIONS", x => x.RootCategoryID);
            table.ForeignKey("FK_VIEWER_DASHBOARD_CUSTOMIZATIONS_CATEGORIES", x => x.RootCategoryID,
                "CATEGORIES", "CategoryID", onDelete: ReferentialAction.Cascade);
        });
        migrationBuilder.CreateTable(name: "VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS", columns: table => new
        {
            RootCategoryID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            CategoryID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            SortOrder = table.Column<int>(type: "int", nullable: false),
            ViewerImageMediaID_FK = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
            ViewerIcon = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
            DisplayColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS", x => new { x.RootCategoryID, x.CategoryID });
            table.ForeignKey("FK_VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS_DASHBOARD", x => x.RootCategoryID,
                "VIEWER_DASHBOARD_CUSTOMIZATIONS", "RootCategoryID", onDelete: ReferentialAction.Cascade);
            table.ForeignKey("FK_VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS_CATEGORY", x => x.CategoryID,
                "CATEGORIES", "CategoryID", onDelete: ReferentialAction.Restrict);
            table.ForeignKey("FK_VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS_MEDIA", x => x.ViewerImageMediaID_FK,
                "MEDIA_FILES", "MediaID", onDelete: ReferentialAction.SetNull);
        });
        migrationBuilder.CreateIndex("IX_VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS_CategoryID", "VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS", "CategoryID");
        migrationBuilder.CreateIndex("IX_VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS_ViewerImageMediaID_FK", "VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS", "ViewerImageMediaID_FK");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("VIEWER_DASHBOARD_CATEGORY_CUSTOMIZATIONS");
        migrationBuilder.DropTable("VIEWER_DASHBOARD_CUSTOMIZATIONS");
    }
}
