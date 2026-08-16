using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

public partial class AddContentVisibility : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "Visibility", table: "CATEGORIES", type: "nvarchar(20)",
            maxLength: 20, nullable: false, defaultValue: "Public");
        migrationBuilder.AddColumn<string>(name: "Visibility", table: "ARTICLES", type: "nvarchar(20)",
            maxLength: 20, nullable: false, defaultValue: "Public");
        migrationBuilder.AddCheckConstraint("CK_CATEGORIES_Visibility", "CATEGORIES",
            "[Visibility] IN ('Public', 'Internal')");
        migrationBuilder.AddCheckConstraint("CK_ARTICLES_Visibility", "ARTICLES",
            "[Visibility] IN ('Public', 'Internal')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint("CK_CATEGORIES_Visibility", "CATEGORIES");
        migrationBuilder.DropCheckConstraint("CK_ARTICLES_Visibility", "ARTICLES");
        migrationBuilder.DropColumn("Visibility", "CATEGORIES");
        migrationBuilder.DropColumn("Visibility", "ARTICLES");
    }
}
