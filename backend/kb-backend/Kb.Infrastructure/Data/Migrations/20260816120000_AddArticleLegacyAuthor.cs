using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

public partial class AddArticleLegacyAuthor : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "LegacyAuthorName", table: "ARTICLES", type: "nvarchar(300)",
            maxLength: 300, nullable: true);
        migrationBuilder.AddColumn<string>(name: "LegacyAuthorEmail", table: "ARTICLES", type: "nvarchar(320)",
            maxLength: 320, nullable: true);
        migrationBuilder.AddColumn<string>(name: "LegacyAuthorExternalId", table: "ARTICLES", type: "nvarchar(100)",
            maxLength: 100, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("LegacyAuthorName", "ARTICLES");
        migrationBuilder.DropColumn("LegacyAuthorEmail", "ARTICLES");
        migrationBuilder.DropColumn("LegacyAuthorExternalId", "ARTICLES");
    }
}
