using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260824170000_AddProtectedTranslationTerms")]
public sealed class AddProtectedTranslationTerms : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "PROTECTED_TRANSLATION_TERMS",
            columns: table => new
            {
                ProtectedTranslationTermID = table.Column<Guid>(type: "uniqueidentifier", nullable: false,
                    defaultValueSql: "(newsequentialid())"),
                Term = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                LocaleCode = table.Column<string>(type: "nvarchar(35)", maxLength: 35, nullable: true),
                IsEnabled = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                MetadataJson = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                CreatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false,
                    defaultValueSql: "(sysutcdatetime())"),
                UpdatedAt = table.Column<DateTime>(type: "datetime2(3)", nullable: false,
                    defaultValueSql: "(sysutcdatetime())")
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PROTECTED_TRANSLATION_TERMS", item => item.ProtectedTranslationTermID);
                table.CheckConstraint("CK_PROTECTED_TRANSLATION_TERMS_Term", "LEN(LTRIM(RTRIM([Term]))) > 0");
                table.ForeignKey("FK_PROTECTED_TRANSLATION_TERMS_LocaleCode_KB_LANGUAGES", item => item.LocaleCode,
                    "KB_LANGUAGES", "LocaleCode", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex("IX_PROTECTED_TRANSLATION_TERMS_LocaleCode_Enabled",
            "PROTECTED_TRANSLATION_TERMS", new[] { "LocaleCode", "IsEnabled" });
        migrationBuilder.CreateIndex("UX_PROTECTED_TRANSLATION_TERMS_Term_LocaleCode",
            "PROTECTED_TRANSLATION_TERMS", new[] { "Term", "LocaleCode" }, unique: true,
            filter: "([LocaleCode] IS NOT NULL)");
        migrationBuilder.CreateIndex("UX_PROTECTED_TRANSLATION_TERMS_GlobalTerm",
            "PROTECTED_TRANSLATION_TERMS", "Term", unique: true, filter: "([LocaleCode] IS NULL)");

        migrationBuilder.Sql("""
            INSERT INTO [PROTECTED_TRANSLATION_TERMS]
                ([ProtectedTranslationTermID], [Term], [LocaleCode], [IsEnabled], [CreatedAt], [UpdatedAt])
            VALUES
                (NEWID(), N'SwiftAssess', NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
                (NEWID(), N'GamaLearn', NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
                (NEWID(), N'OAuth', NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
                (NEWID(), N'API', NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable("PROTECTED_TRANSLATION_TERMS");
}
