using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260824130000_AddLocalizationPersistenceFoundation")]
public sealed class AddLocalizationPersistenceFoundation : Migration
{
    private const string DefaultLocaleCode = "en";

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "KB_LANGUAGES",
            columns: table => new
            {
                LanguageID = table.Column<Guid>(type: "uniqueidentifier", nullable: false,
                    defaultValueSql: "(newsequentialid())"),
                LocaleCode = table.Column<string>(type: "nvarchar(35)", maxLength: 35, nullable: false),
                DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                NativeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                IsDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                IsEnabled = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                IsRtl = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                SortOrder = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                CreatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false,
                    defaultValueSql: "(sysutcdatetime())"),
                UpdatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false,
                    defaultValueSql: "(sysutcdatetime())")
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_KB_LANGUAGES", item => item.LanguageID);
                table.UniqueConstraint("UX_KB_LANGUAGES_LocaleCode", item => item.LocaleCode);
                table.CheckConstraint("CK_KB_LANGUAGES_DefaultEnabled", "[IsDefault] = 0 OR [IsEnabled] = 1");
                table.CheckConstraint("CK_KB_LANGUAGES_LocaleCode", "[LocaleCode] <> ''");
                table.CheckConstraint("CK_KB_LANGUAGES_SortOrder", "[SortOrder] >= 0");
            });

        migrationBuilder.CreateIndex(
            name: "UX_KB_LANGUAGES_Default",
            table: "KB_LANGUAGES",
            column: "IsDefault",
            unique: true,
            filter: "([IsDefault] = (1))");

        migrationBuilder.Sql($"""
            INSERT INTO [KB_LANGUAGES]
                ([LanguageID], [LocaleCode], [DisplayName], [NativeName], [IsDefault], [IsEnabled], [IsRtl], [SortOrder], [CreatedAt], [UpdatedAt])
            VALUES
                ('2FD39138-6F8E-40BF-962F-D43CC8350F0C', N'{DefaultLocaleCode}', N'English', N'English', 1, 1, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME());
            """);

        migrationBuilder.CreateTable(
            name: "ARTICLE_TRANSLATION_GROUPS",
            columns: table => new
            {
                TranslationGroupID = table.Column<Guid>(type: "uniqueidentifier", nullable: false,
                    defaultValueSql: "(newsequentialid())"),
                CreatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false,
                    defaultValueSql: "(sysutcdatetime())")
            },
            constraints: table => table.PrimaryKey("PK_ARTICLE_TRANSLATION_GROUPS", item => item.TranslationGroupID));

        // Add nullable columns first so no existing article is rejected while data is being backfilled.
        migrationBuilder.AddColumn<string>(
            name: "LocaleCode",
            table: "ARTICLES",
            type: "nvarchar(35)",
            maxLength: 35,
            nullable: true);
        migrationBuilder.AddColumn<Guid>(
            name: "TranslationGroupID",
            table: "ARTICLES",
            type: "uniqueidentifier",
            nullable: true);

        // Each pre-existing article is intentionally a standalone original, rather than assuming
        // any relationship from matching slugs or titles.
        migrationBuilder.Sql($"""
            UPDATE [ARTICLES]
            SET [LocaleCode] = N'{DefaultLocaleCode}',
                [TranslationGroupID] = NEWID()
            WHERE [TranslationGroupID] IS NULL;

            INSERT INTO [ARTICLE_TRANSLATION_GROUPS] ([TranslationGroupID], [CreatedAt])
            SELECT [TranslationGroupID], [CreatedAt]
            FROM [ARTICLES];
            """);

        migrationBuilder.AlterColumn<string>(
            name: "LocaleCode",
            table: "ARTICLES",
            type: "nvarchar(35)",
            maxLength: 35,
            nullable: false,
            oldClrType: typeof(string),
            oldType: "nvarchar(35)",
            oldMaxLength: 35,
            oldNullable: true);
        migrationBuilder.Sql($"""
            ALTER TABLE [ARTICLES]
            ADD CONSTRAINT [DF_ARTICLES_LocaleCode] DEFAULT (N'{DefaultLocaleCode}') FOR [LocaleCode];
            """);
        migrationBuilder.AlterColumn<Guid>(
            name: "TranslationGroupID",
            table: "ARTICLES",
            type: "uniqueidentifier",
            nullable: false,
            oldClrType: typeof(Guid),
            oldType: "uniqueidentifier",
            oldNullable: true);

        migrationBuilder.AddUniqueConstraint(
            name: "AK_ARTICLE_VERSIONS_ArticleID_VersionID",
            table: "ARTICLE_VERSIONS",
            columns: new[] { "ArticleID_FK", "VersionID" });

        migrationBuilder.CreateTable(
            name: "ARTICLE_TRANSLATION_METADATA",
            columns: table => new
            {
                ArticleID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                SourceArticleID = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                SourceVersionID = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                SourceVersionNumber = table.Column<int>(type: "int", nullable: true),
                TranslationMethod = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false,
                    defaultValue: "Original"),
                TranslationStatus = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false,
                    defaultValue: "Original"),
                AssignedTranslatorUserID = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                LastTranslatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: true),
                VerifiedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: true),
                VerifiedByUserID = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ARTICLE_TRANSLATION_METADATA", item => item.ArticleID);
                table.CheckConstraint("CK_ARTICLE_TRANSLATION_METADATA_Method",
                    "[TranslationMethod] IN ('Original', 'Manual', 'Automatic', 'LinkedExisting', 'Copied')");
                table.CheckConstraint("CK_ARTICLE_TRANSLATION_METADATA_Status",
                    "[TranslationStatus] IN ('Original', 'NeedsTranslation', 'NeedsVerification', 'Verified', 'OutOfDate')");
                table.CheckConstraint("CK_ARTICLE_TRANSLATION_METADATA_SourceVersion",
                    "[SourceVersionID] IS NULL OR [SourceArticleID] IS NOT NULL");
                table.ForeignKey("FK_ARTICLE_TRANSLATION_METADATA_ARTICLES", item => item.ArticleID,
                    "ARTICLES", "ArticleID", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_ARTICLE_TRANSLATION_METADATA_Source_ARTICLES", item => item.SourceArticleID,
                    "ARTICLES", "ArticleID", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_ARTICLE_TRANSLATION_METADATA_Source_ARTICLE_VERSIONS",
                    item => new { item.SourceArticleID, item.SourceVersionID }, "ARTICLE_VERSIONS",
                    principalColumns: new[] { "ArticleID_FK", "VersionID" }, onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_ARTICLE_TRANSLATION_METADATA_AssignedTranslator_USERS", item => item.AssignedTranslatorUserID,
                    "USERS", "UserID", onDelete: ReferentialAction.SetNull);
                table.ForeignKey("FK_ARTICLE_TRANSLATION_METADATA_VerifiedBy_USERS", item => item.VerifiedByUserID,
                    "USERS", "UserID", onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "CATEGORY_LOCALIZATIONS",
            columns: table => new
            {
                CategoryID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                LocaleCode = table.Column<string>(type: "nvarchar(35)", maxLength: 35, nullable: false),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CATEGORY_LOCALIZATIONS", item => new { item.CategoryID, item.LocaleCode });
                table.ForeignKey("FK_CATEGORY_LOCALIZATIONS_CATEGORIES", item => item.CategoryID,
                    "CATEGORIES", "CategoryID", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_CATEGORY_LOCALIZATIONS_LocaleCode_KB_LANGUAGES", item => item.LocaleCode,
                    "KB_LANGUAGES", "LocaleCode", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "UX_ARTICLES_TranslationGroupID_LocaleCode",
            table: "ARTICLES",
            columns: new[] { "TranslationGroupID", "LocaleCode" },
            unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_ARTICLE_TRANSLATION_METADATA_AssignedTranslatorUserID",
            table: "ARTICLE_TRANSLATION_METADATA",
            column: "AssignedTranslatorUserID",
            filter: "([AssignedTranslatorUserID] IS NOT NULL)");
        migrationBuilder.CreateIndex(
            name: "IX_ARTICLE_TRANSLATION_METADATA_SourceArticleID",
            table: "ARTICLE_TRANSLATION_METADATA",
            column: "SourceArticleID",
            filter: "([SourceArticleID] IS NOT NULL)");
        migrationBuilder.CreateIndex(
            name: "IX_ARTICLE_TRANSLATION_METADATA_VerifiedByUserID",
            table: "ARTICLE_TRANSLATION_METADATA",
            column: "VerifiedByUserID",
            filter: "([VerifiedByUserID] IS NOT NULL)");

        migrationBuilder.AddForeignKey(
            name: "FK_ARTICLES_LocaleCode_KB_LANGUAGES",
            table: "ARTICLES",
            column: "LocaleCode",
            principalTable: "KB_LANGUAGES",
            principalColumn: "LocaleCode",
            onDelete: ReferentialAction.Restrict);
        migrationBuilder.AddForeignKey(
            name: "FK_ARTICLES_TranslationGroup_ARTICLE_TRANSLATION_GROUPS",
            table: "ARTICLES",
            column: "TranslationGroupID",
            principalTable: "ARTICLE_TRANSLATION_GROUPS",
            principalColumn: "TranslationGroupID",
            onDelete: ReferentialAction.Restrict);

        migrationBuilder.Sql($"""
            INSERT INTO [ARTICLE_TRANSLATION_METADATA]
                ([ArticleID], [TranslationMethod], [TranslationStatus], [LastTranslatedAt])
            SELECT [ArticleID], N'Original', N'Original', [CreatedAt]
            FROM [ARTICLES];

            INSERT INTO [CATEGORY_LOCALIZATIONS] ([CategoryID], [LocaleCode], [Name], [Description])
            SELECT [CategoryID], N'{DefaultLocaleCode}', [Name], [Description]
            FROM [CATEGORIES];
            """);

        migrationBuilder.Sql("""
            CREATE TRIGGER [TR_KB_LANGUAGES_RequireOneEnabledDefault]
            ON [KB_LANGUAGES]
            AFTER INSERT, UPDATE, DELETE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF (SELECT COUNT(*) FROM [KB_LANGUAGES] WHERE [IsDefault] = 1 AND [IsEnabled] = 1) <> 1
                BEGIN
                    ROLLBACK TRANSACTION;
                    THROW 51000, 'KB_LANGUAGES must contain exactly one enabled default language.', 1;
                END
            END;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[dbo].[TR_KB_LANGUAGES_RequireOneEnabledDefault]', N'TR') IS NOT NULL
                DROP TRIGGER [TR_KB_LANGUAGES_RequireOneEnabledDefault];
            """);
        migrationBuilder.DropForeignKey("FK_ARTICLES_LocaleCode_KB_LANGUAGES", "ARTICLES");
        migrationBuilder.DropForeignKey("FK_ARTICLES_TranslationGroup_ARTICLE_TRANSLATION_GROUPS", "ARTICLES");
        migrationBuilder.DropTable("ARTICLE_TRANSLATION_METADATA");
        migrationBuilder.DropTable("CATEGORY_LOCALIZATIONS");
        migrationBuilder.DropIndex("UX_ARTICLES_TranslationGroupID_LocaleCode", "ARTICLES");
        migrationBuilder.DropUniqueConstraint("AK_ARTICLE_VERSIONS_ArticleID_VersionID", "ARTICLE_VERSIONS");
        migrationBuilder.Sql("ALTER TABLE [ARTICLES] DROP CONSTRAINT [DF_ARTICLES_LocaleCode];");
        migrationBuilder.DropColumn("LocaleCode", "ARTICLES");
        migrationBuilder.DropColumn("TranslationGroupID", "ARTICLES");
        migrationBuilder.DropTable("ARTICLE_TRANSLATION_GROUPS");
        migrationBuilder.DropTable("KB_LANGUAGES");
    }
}
