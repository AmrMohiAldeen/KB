IF COL_LENGTH('dbo.USERS', 'HelpJuiceUserID') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceUserID nvarchar(450) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceFirstName') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceFirstName nvarchar(max) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceLastName') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceLastName nvarchar(max) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceJobTitle') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceJobTitle nvarchar(max) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceEmail') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceEmail nvarchar(max) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceNotifyAboutDrafts') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceNotifyAboutDrafts bit NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceNotifyAboutArticles') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceNotifyAboutArticles bit NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceWeeklyAnalyticsSubscribed') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceWeeklyAnalyticsSubscribed bit NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceWeeklyArticlesSubscribed') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceWeeklyArticlesSubscribed bit NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceSignInCount') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceSignInCount int NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceCurrentSignInAt') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceCurrentSignInAt datetime2(3) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceLastSignInAt') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceLastSignInAt datetime2(3) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceCurrentSignInIP') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceCurrentSignInIP nvarchar(45) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceLastSignInIP') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceLastSignInIP nvarchar(45) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceCreatedAt') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceCreatedAt datetime2(3) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceUpdatedAt') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceUpdatedAt datetime2(3) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuicePasswordChangedAt') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuicePasswordChangedAt datetime2(3) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceRoleID') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceRoleID nvarchar(max) NULL;
IF COL_LENGTH('dbo.USERS', 'HelpJuiceDeactivatedAt') IS NULL
    ALTER TABLE dbo.USERS ADD HelpJuiceDeactivatedAt datetime2(3) NULL;

IF (CASE WHEN COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorExternalId') IS NULL THEN 0 ELSE 1 END
  + CASE WHEN COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorEmail') IS NULL THEN 0 ELSE 1 END
  + CASE WHEN COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorName') IS NULL THEN 0 ELSE 1 END) BETWEEN 1 AND 2
    THROW 50001, 'Legacy HelpJuice author columns are incomplete; repair the schema before removing them.', 1;

IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorExternalId') IS NOT NULL
   AND COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorEmail') IS NOT NULL
   AND COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorName') IS NOT NULL
BEGIN
    EXEC(N'
        ;WITH EmailMappings AS
        (
            SELECT LegacyAuthorEmail, MIN(LegacyAuthorExternalId) AS HelpJuiceUserID
            FROM dbo.ARTICLES
            WHERE LegacyAuthorEmail IS NOT NULL AND LegacyAuthorExternalId IS NOT NULL
            GROUP BY LegacyAuthorEmail
            HAVING COUNT(DISTINCT LegacyAuthorExternalId) = 1
        ),
        UniqueMappings AS
        (
            SELECT mapping.LegacyAuthorEmail, mapping.HelpJuiceUserID
            FROM EmailMappings mapping
            WHERE NOT EXISTS
            (
                SELECT 1 FROM EmailMappings other
                WHERE other.HelpJuiceUserID = mapping.HelpJuiceUserID
                  AND other.LegacyAuthorEmail <> mapping.LegacyAuthorEmail
            )
        )
        UPDATE destination
        SET destination.HelpJuiceUserID = mapping.HelpJuiceUserID,
            destination.HelpJuiceEmail = mapping.LegacyAuthorEmail
        FROM dbo.USERS destination
        INNER JOIN UniqueMappings mapping ON mapping.LegacyAuthorEmail = destination.Email
        WHERE destination.HelpJuiceUserID IS NULL
          AND NOT EXISTS
          (
              SELECT 1 FROM dbo.USERS existing
              WHERE existing.HelpJuiceUserID = mapping.HelpJuiceUserID
                AND existing.UserID <> destination.UserID
          );

        ;WITH LegacyAuthors AS
        (
            SELECT LegacyAuthorExternalId AS HelpJuiceUserID,
                   MAX(LegacyAuthorName) AS LegacyAuthorName,
                   MAX(LegacyAuthorEmail) AS LegacyAuthorEmail
            FROM dbo.ARTICLES
            WHERE LegacyAuthorExternalId IS NOT NULL
            GROUP BY LegacyAuthorExternalId
        )
        INSERT INTO dbo.USERS
            (Email, FullName, IsActive, CreatedAt, HelpJuiceUserID, HelpJuiceFirstName, HelpJuiceEmail)
        SELECT
            CONCAT(''helpjuice-'', LOWER(CONVERT(varchar(64),
                HASHBYTES(''SHA2_256'', source.HelpJuiceUserID), 2)), ''@helpjuice.invalid''),
            LEFT(COALESCE(NULLIF(LTRIM(RTRIM(source.LegacyAuthorName)), ''''),
                NULLIF(LTRIM(RTRIM(source.LegacyAuthorEmail)), ''''),
                CONCAT(''HelpJuice user '', source.HelpJuiceUserID)), 200),
            CAST(0 AS bit),
            SYSUTCDATETIME(),
            source.HelpJuiceUserID,
            source.LegacyAuthorName,
            source.LegacyAuthorEmail
        FROM LegacyAuthors source
        WHERE NOT EXISTS
        (
            SELECT 1 FROM dbo.USERS destination
            WHERE destination.HelpJuiceUserID = source.HelpJuiceUserID
        );

        UPDATE article
        SET article.AuthorID_FK = destination.UserID
        FROM dbo.ARTICLES article
        INNER JOIN dbo.USERS destination
            ON destination.HelpJuiceUserID = article.LegacyAuthorExternalId
        WHERE article.LegacyAuthorExternalId IS NOT NULL;

        UPDATE draft
        SET draft.CreatedBy_FK = article.AuthorID_FK,
            draft.UpdatedBy_FK = article.AuthorID_FK
        FROM dbo.ARTICLE_DRAFTS draft
        INNER JOIN dbo.ARTICLES article ON article.ArticleID = draft.ArticleID_FK
        WHERE article.LegacyAuthorExternalId IS NOT NULL;

    ');
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_USERS_HelpJuiceUserID' AND object_id = OBJECT_ID('dbo.USERS'))
    CREATE UNIQUE INDEX UX_USERS_HelpJuiceUserID
        ON dbo.USERS (HelpJuiceUserID)
        WHERE HelpJuiceUserID IS NOT NULL;

IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorName') IS NOT NULL
    ALTER TABLE dbo.ARTICLES DROP COLUMN LegacyAuthorName;
IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorEmail') IS NOT NULL
    ALTER TABLE dbo.ARTICLES DROP COLUMN LegacyAuthorEmail;
IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorExternalId') IS NOT NULL
    ALTER TABLE dbo.ARTICLES DROP COLUMN LegacyAuthorExternalId;
