using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kb.Infrastructure.Data.Migrations;

[DbContext(typeof(KbDbContext))]
[Migration("20260819160000_AddHelpJuiceUsersAndRemoveLegacyAuthors")]
public sealed class AddHelpJuiceUsersAndRemoveLegacyAuthors : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>("HelpJuiceCreatedAt", "USERS", "datetime2(3)", nullable: true);
        migrationBuilder.AddColumn<DateTime>("HelpJuiceCurrentSignInAt", "USERS", "datetime2(3)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceCurrentSignInIP", "USERS", "nvarchar(45)", maxLength: 45, nullable: true);
        migrationBuilder.AddColumn<DateTime>("HelpJuiceDeactivatedAt", "USERS", "datetime2(3)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceEmail", "USERS", "nvarchar(max)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceFirstName", "USERS", "nvarchar(max)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceJobTitle", "USERS", "nvarchar(max)", nullable: true);
        migrationBuilder.AddColumn<DateTime>("HelpJuiceLastSignInAt", "USERS", "datetime2(3)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceLastSignInIP", "USERS", "nvarchar(45)", maxLength: 45, nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceLastName", "USERS", "nvarchar(max)", nullable: true);
        migrationBuilder.AddColumn<bool>("HelpJuiceNotifyAboutArticles", "USERS", "bit", nullable: true);
        migrationBuilder.AddColumn<bool>("HelpJuiceNotifyAboutDrafts", "USERS", "bit", nullable: true);
        migrationBuilder.AddColumn<DateTime>("HelpJuicePasswordChangedAt", "USERS", "datetime2(3)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceRoleID", "USERS", "nvarchar(max)", nullable: true);
        migrationBuilder.AddColumn<int>("HelpJuiceSignInCount", "USERS", "int", nullable: true);
        migrationBuilder.AddColumn<DateTime>("HelpJuiceUpdatedAt", "USERS", "datetime2(3)", nullable: true);
        migrationBuilder.AddColumn<string>("HelpJuiceUserID", "USERS", "nvarchar(450)", maxLength: 450, nullable: true);
        migrationBuilder.AddColumn<bool>("HelpJuiceWeeklyAnalyticsSubscribed", "USERS", "bit", nullable: true);
        migrationBuilder.AddColumn<bool>("HelpJuiceWeeklyArticlesSubscribed", "USERS", "bit", nullable: true);

        migrationBuilder.Sql("""
            ;WITH EmailMappings AS
            (
                SELECT LegacyAuthorEmail,
                       MIN(LegacyAuthorExternalId) AS HelpJuiceUserID
                FROM ARTICLES
                WHERE LegacyAuthorEmail IS NOT NULL
                  AND LegacyAuthorExternalId IS NOT NULL
                GROUP BY LegacyAuthorEmail
                HAVING COUNT(DISTINCT LegacyAuthorExternalId) = 1
            ),
            UniqueMappings AS
            (
                SELECT mapping.LegacyAuthorEmail, mapping.HelpJuiceUserID
                FROM EmailMappings mapping
                WHERE NOT EXISTS
                (
                    SELECT 1
                    FROM EmailMappings other
                    WHERE other.HelpJuiceUserID = mapping.HelpJuiceUserID
                      AND other.LegacyAuthorEmail <> mapping.LegacyAuthorEmail
                )
            )
            UPDATE destination
            SET destination.HelpJuiceUserID = mapping.HelpJuiceUserID,
                destination.HelpJuiceEmail = mapping.LegacyAuthorEmail
            FROM USERS destination
            INNER JOIN UniqueMappings mapping ON mapping.LegacyAuthorEmail = destination.Email
            WHERE destination.HelpJuiceUserID IS NULL
              AND NOT EXISTS
              (
                  SELECT 1
                  FROM USERS existing
                  WHERE existing.HelpJuiceUserID = mapping.HelpJuiceUserID
                    AND existing.UserID <> destination.UserID
              );

            ;WITH LegacyAuthors AS
            (
                SELECT LegacyAuthorExternalId AS HelpJuiceUserID,
                       MAX(LegacyAuthorName) AS LegacyAuthorName,
                       MAX(LegacyAuthorEmail) AS LegacyAuthorEmail
                FROM ARTICLES
                WHERE LegacyAuthorExternalId IS NOT NULL
                GROUP BY LegacyAuthorExternalId
            )
            INSERT INTO USERS
                (Email, FullName, IsActive, CreatedAt, HelpJuiceUserID, HelpJuiceFirstName, HelpJuiceEmail)
            SELECT
                CONCAT('helpjuice-', LOWER(CONVERT(varchar(64),
                    HASHBYTES('SHA2_256', source.HelpJuiceUserID), 2)), '@helpjuice.invalid'),
                LEFT(COALESCE(NULLIF(LTRIM(RTRIM(source.LegacyAuthorName)), ''),
                    NULLIF(LTRIM(RTRIM(source.LegacyAuthorEmail)), ''),
                    CONCAT('HelpJuice user ', source.HelpJuiceUserID)), 200),
                CAST(0 AS bit),
                SYSUTCDATETIME(),
                source.HelpJuiceUserID,
                source.LegacyAuthorName,
                source.LegacyAuthorEmail
            FROM LegacyAuthors source
            WHERE NOT EXISTS
            (
                SELECT 1 FROM USERS destination
                WHERE destination.HelpJuiceUserID = source.HelpJuiceUserID
            );

            UPDATE article
            SET article.AuthorID_FK = destination.UserID
            FROM ARTICLES article
            INNER JOIN USERS destination
                ON destination.HelpJuiceUserID = article.LegacyAuthorExternalId
            WHERE article.LegacyAuthorExternalId IS NOT NULL;

            UPDATE draft
            SET draft.CreatedBy_FK = article.AuthorID_FK,
                draft.UpdatedBy_FK = article.AuthorID_FK
            FROM ARTICLE_DRAFTS draft
            INNER JOIN ARTICLES article ON article.ArticleID = draft.ArticleID_FK
            WHERE article.LegacyAuthorExternalId IS NOT NULL;

            """);

        migrationBuilder.CreateIndex(
            name: "UX_USERS_HelpJuiceUserID",
            table: "USERS",
            column: "HelpJuiceUserID",
            unique: true,
            filter: "([HelpJuiceUserID] IS NOT NULL)");

        migrationBuilder.DropColumn("LegacyAuthorName", "ARTICLES");
        migrationBuilder.DropColumn("LegacyAuthorEmail", "ARTICLES");
        migrationBuilder.DropColumn("LegacyAuthorExternalId", "ARTICLES");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("LegacyAuthorName", "ARTICLES", "nvarchar(300)", maxLength: 300, nullable: true);
        migrationBuilder.AddColumn<string>("LegacyAuthorEmail", "ARTICLES", "nvarchar(320)", maxLength: 320, nullable: true);
        migrationBuilder.AddColumn<string>("LegacyAuthorExternalId", "ARTICLES", "nvarchar(100)", maxLength: 100, nullable: true);

        migrationBuilder.Sql("""
            UPDATE article
            SET article.LegacyAuthorName = COALESCE(
                    NULLIF(CONCAT(destination.HelpJuiceFirstName, ' ', destination.HelpJuiceLastName), ' '),
                    destination.FullName),
                article.LegacyAuthorEmail = destination.HelpJuiceEmail,
                article.LegacyAuthorExternalId = LEFT(destination.HelpJuiceUserID, 100)
            FROM ARTICLES article
            INNER JOIN USERS destination ON destination.UserID = article.AuthorID_FK
            WHERE destination.HelpJuiceUserID IS NOT NULL;
            """);

        migrationBuilder.DropIndex("UX_USERS_HelpJuiceUserID", "USERS");
        migrationBuilder.DropColumn("HelpJuiceCreatedAt", "USERS");
        migrationBuilder.DropColumn("HelpJuiceCurrentSignInAt", "USERS");
        migrationBuilder.DropColumn("HelpJuiceCurrentSignInIP", "USERS");
        migrationBuilder.DropColumn("HelpJuiceDeactivatedAt", "USERS");
        migrationBuilder.DropColumn("HelpJuiceEmail", "USERS");
        migrationBuilder.DropColumn("HelpJuiceFirstName", "USERS");
        migrationBuilder.DropColumn("HelpJuiceJobTitle", "USERS");
        migrationBuilder.DropColumn("HelpJuiceLastSignInAt", "USERS");
        migrationBuilder.DropColumn("HelpJuiceLastSignInIP", "USERS");
        migrationBuilder.DropColumn("HelpJuiceLastName", "USERS");
        migrationBuilder.DropColumn("HelpJuiceNotifyAboutArticles", "USERS");
        migrationBuilder.DropColumn("HelpJuiceNotifyAboutDrafts", "USERS");
        migrationBuilder.DropColumn("HelpJuicePasswordChangedAt", "USERS");
        migrationBuilder.DropColumn("HelpJuiceRoleID", "USERS");
        migrationBuilder.DropColumn("HelpJuiceSignInCount", "USERS");
        migrationBuilder.DropColumn("HelpJuiceUpdatedAt", "USERS");
        migrationBuilder.DropColumn("HelpJuiceUserID", "USERS");
        migrationBuilder.DropColumn("HelpJuiceWeeklyAnalyticsSubscribed", "USERS");
        migrationBuilder.DropColumn("HelpJuiceWeeklyArticlesSubscribed", "USERS");
    }
}
