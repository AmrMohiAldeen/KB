using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260823130000_AddViewerDashboardSettings")]
public sealed class AddViewerDashboardSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "VIEWER_DASHBOARD_SETTINGS",
            columns: table => new
            {
                SettingsID = table.Column<int>(type: "int", nullable: false),
                PrimaryColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                PageBackgroundColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                CategoryCardBackgroundColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                TextColor = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_VIEWER_DASHBOARD_SETTINGS", item => item.SettingsID);
                table.CheckConstraint("CK_VIEWER_DASHBOARD_SETTINGS_Singleton", "[SettingsID] = 1");
            });
        migrationBuilder.Sql("""
            INSERT INTO [VIEWER_DASHBOARD_SETTINGS]
                ([SettingsID], [PrimaryColor], [PageBackgroundColor], [CategoryCardBackgroundColor], [TextColor], [UpdatedAt])
            VALUES (1, '#1976D2', '#F8FAFC', '#FFFFFF', '#1E293B', SYSUTCDATETIME());
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "VIEWER_DASHBOARD_SETTINGS");
}
