SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- Validate required tables
    ------------------------------------------------------------
    IF OBJECT_ID(N'dbo.ARTICLE_DRAFTS', N'U') IS NULL
        THROW 50001, 'Table dbo.ARTICLE_DRAFTS does not exist.', 1;

    IF OBJECT_ID(N'dbo.ARTICLE_VERSIONS', N'U') IS NULL
        THROW 50002, 'Table dbo.ARTICLE_VERSIONS does not exist.', 1;

    IF OBJECT_ID(N'dbo.ARTICLES', N'U') IS NULL
        THROW 50003, 'Table dbo.ARTICLES does not exist.', 1;

    ------------------------------------------------------------
    -- ARTICLE_DRAFTS.DraftNumber
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_DRAFTS', N'DraftNumber') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_DRAFTS
            ADD DraftNumber int NULL;
        ';
    END;

    -- Populate or repair draft numbers if NULLs or duplicates exist.
    IF EXISTS
    (
        SELECT 1
        FROM dbo.ARTICLE_DRAFTS
        WHERE DraftNumber IS NULL
    )
    OR EXISTS
    (
        SELECT ArticleID_FK, DraftNumber
        FROM dbo.ARTICLE_DRAFTS
        WHERE DraftNumber IS NOT NULL
        GROUP BY ArticleID_FK, DraftNumber
        HAVING COUNT(*) > 1
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ;WITH NumberedDrafts AS
            (
                SELECT
                    DraftID,
                    CAST
                    (
                        ROW_NUMBER() OVER
                        (
                            PARTITION BY ArticleID_FK
                            ORDER BY CreatedAt, DraftID
                        )
                        AS int
                    ) AS NewDraftNumber
                FROM dbo.ARTICLE_DRAFTS
            )
            UPDATE Drafts
            SET DraftNumber = NumberedDrafts.NewDraftNumber
            FROM dbo.ARTICLE_DRAFTS AS Drafts
            INNER JOIN NumberedDrafts
                ON NumberedDrafts.DraftID = Drafts.DraftID;
        ';
    END;

    -- Make DraftNumber required.
    IF EXISTS
    (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.ARTICLE_DRAFTS')
          AND name = N'DraftNumber'
          AND is_nullable = 1
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_DRAFTS
            ALTER COLUMN DraftNumber int NOT NULL;
        ';
    END;

    -- Add a default only when the column has no existing default.
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.default_constraints AS dc
        INNER JOIN sys.columns AS c
            ON c.object_id = dc.parent_object_id
           AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ARTICLE_DRAFTS')
          AND c.name = N'DraftNumber'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_DRAFTS
            ADD CONSTRAINT DF_ARTICLE_DRAFTS_DraftNumber
                DEFAULT (1) FOR DraftNumber;
        ';
    END;

    -- Draft numbers must be unique within each article.
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.ARTICLE_DRAFTS')
          AND name = N'UX_ARTICLE_DRAFTS_Article_DraftNumber'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE UNIQUE INDEX UX_ARTICLE_DRAFTS_Article_DraftNumber
            ON dbo.ARTICLE_DRAFTS
            (
                ArticleID_FK,
                DraftNumber
            );
        ';
    END;

    ------------------------------------------------------------
    -- ARTICLE_VERSIONS source draft fields
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_VERSIONS', N'SourceDraftID_FK') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD SourceDraftID_FK uniqueidentifier NULL;
        ';
    END;

    IF COL_LENGTH(N'dbo.ARTICLE_VERSIONS', N'SourceDraftNumber') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD SourceDraftNumber int NULL;
        ';
    END;

    IF COL_LENGTH(N'dbo.ARTICLE_VERSIONS', N'SnapshotReason') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD SnapshotReason nvarchar(50) NOT NULL
                CONSTRAINT DF_ARTICLE_VERSIONS_SnapshotReason
                DEFAULT (N''Published'');
        ';
    END;

    ------------------------------------------------------------
    -- Link existing published versions to their source drafts
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        UPDATE Versions
        SET
            SourceDraftID_FK = Drafts.DraftID,
            SourceDraftNumber = Drafts.DraftNumber
        FROM dbo.ARTICLE_VERSIONS AS Versions
        INNER JOIN dbo.ARTICLES AS Articles
            ON Articles.LastPublishedVersionID_FK = Versions.VersionID
        INNER JOIN dbo.ARTICLE_DRAFTS AS Drafts
            ON Drafts.DraftID = Articles.CurrentDraftID_FK
           AND Drafts.ArticleID_FK = Versions.ArticleID_FK
        WHERE Versions.SourceDraftID_FK IS NULL
          AND Articles.Status = N''Published''
          AND Drafts.Status = N''Published'';
    ';

    ------------------------------------------------------------
    -- Nullable source-draft foreign key
    ------------------------------------------------------------
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.ARTICLE_VERSIONS')
          AND name =
              N'FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS WITH CHECK
            ADD CONSTRAINT
                FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS
            FOREIGN KEY (SourceDraftID_FK)
            REFERENCES dbo.ARTICLE_DRAFTS (DraftID)
            ON DELETE SET NULL;

            ALTER TABLE dbo.ARTICLE_VERSIONS
            CHECK CONSTRAINT
                FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS;
        ';
    END;

    COMMIT TRANSACTION;

    PRINT 'Article version-history migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;