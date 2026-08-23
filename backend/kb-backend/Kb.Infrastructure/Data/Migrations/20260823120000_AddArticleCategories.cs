using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260823120000_AddArticleCategories")]
public sealed class AddArticleCategories : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "ARTICLE_CATEGORIES",
            columns: table => new
            {
                ArticleID_FK = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CategoryID_FK = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                IsPrimary = table.Column<bool>(type: "bit", nullable: false, defaultValue: false,
                    defaultValueSql: null),
                SortOrder = table.Column<int>(type: "int", nullable: false, defaultValue: 0,
                    defaultValueSql: null)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ARTICLE_CATEGORIES", value => new
                    { value.ArticleID_FK, value.CategoryID_FK });
                table.CheckConstraint("CK_ARTICLE_CATEGORIES_SortOrder", "[SortOrder] >= 0");
                table.ForeignKey("FK_ARTICLE_CATEGORIES_ARTICLES", value => value.ArticleID_FK,
                    "ARTICLES", "ArticleID", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_ARTICLE_CATEGORIES_CATEGORIES", value => value.CategoryID_FK,
                    "CATEGORIES", "CategoryID", onDelete: ReferentialAction.Restrict);
            });

        // Preserve every pre-migration article/category assignment as its primary membership.
        migrationBuilder.Sql("""
            INSERT INTO [ARTICLE_CATEGORIES] ([ArticleID_FK], [CategoryID_FK], [IsPrimary], [SortOrder])
            SELECT [ArticleID], [CategoryID_FK], 1, 0
            FROM [ARTICLES]
            WHERE [CategoryID_FK] IS NOT NULL;
            """);

        migrationBuilder.CreateIndex(
            name: "IX_ARTICLE_CATEGORIES_CategoryID_SortOrder",
            table: "ARTICLE_CATEGORIES",
            columns: new[] { "CategoryID_FK", "SortOrder", "ArticleID_FK" });
        migrationBuilder.CreateIndex(
            name: "UX_ARTICLE_CATEGORIES_Primary",
            table: "ARTICLE_CATEGORIES",
            column: "ArticleID_FK",
            unique: true,
            filter: "[IsPrimary]=(1)");
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "ARTICLE_CATEGORIES");
}
