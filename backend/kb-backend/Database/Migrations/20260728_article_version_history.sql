SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- Validate required tables
    ------------------------------------------------------------
    IF OBJECT_ID(N'dbo.ARTICLE_DRAFTS', N'U') IS NULL
        RAISERROR(
            'Table dbo.ARTICLE_DRAFTS does not exist.',
            16,
            1
        );

    IF OBJECT_ID(N'dbo.ARTICLE_VERSIONS', N'U') IS NULL
        RAISERROR(
            'Table dbo.ARTICLE_VERSIONS does not exist.',
            16,
            1
        );

    IF OBJECT_ID(N'dbo.ARTICLES', N'U') IS NULL
        RAISERROR(
            'Table dbo.ARTICLES does not exist.',
            16,
            1
        );

    ------------------------------------------------------------
    -- Validate required existing columns
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_DRAFTS', N'DraftID') IS NULL
        RAISERROR(
            'Column dbo.ARTICLE_DRAFTS.DraftID does not exist.',
            16,
            1
        );

    IF COL_LENGTH(N'dbo.ARTICLE_DRAFTS', N'ArticleID_FK') IS NULL
        RAISERROR(
            'Column dbo.ARTICLE_DRAFTS.ArticleID_FK does not exist.',
            16,
            1
        );

    IF COL_LENGTH(N'dbo.ARTICLE_DRAFTS', N'CreatedAt') IS NULL
        RAISERROR(
            'Column dbo.ARTICLE_DRAFTS.CreatedAt does not exist.',
            16,
            1
        );

    IF COL_LENGTH(N'dbo.ARTICLE_VERSIONS', N'VersionID') IS NULL
        RAISERROR(
            'Column dbo.ARTICLE_VERSIONS.VersionID does not exist.',
            16,
            1
        );

    IF COL_LENGTH(N'dbo.ARTICLE_VERSIONS', N'ArticleID_FK') IS NULL
        RAISERROR(
            'Column dbo.ARTICLE_VERSIONS.ArticleID_FK does not exist.',
            16,
            1
        );

    ------------------------------------------------------------
    -- Add ARTICLE_DRAFTS.DraftNumber
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_DRAFTS', N'DraftNumber') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_DRAFTS
            ADD DraftNumber int NULL;
        ';
    END;

    ------------------------------------------------------------
    -- Populate or repair draft numbers
    --
    -- This must be dynamic SQL because DraftNumber may have
    -- been added earlier in this same outer batch.
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        IF EXISTS
        (
            SELECT 1
            FROM dbo.ARTICLE_DRAFTS
            WHERE DraftNumber IS NULL
        )
        OR EXISTS
        (
            SELECT
                ArticleID_FK,
                DraftNumber
            FROM dbo.ARTICLE_DRAFTS
            WHERE DraftNumber IS NOT NULL
            GROUP BY
                ArticleID_FK,
                DraftNumber
            HAVING COUNT(*) > 1
        )
        BEGIN
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
        END;
    ';

    ------------------------------------------------------------
    -- Make DraftNumber required
    ------------------------------------------------------------
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

    ------------------------------------------------------------
    -- Add unique index for article draft numbers
    ------------------------------------------------------------
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.ARTICLE_DRAFTS')
          AND name = N'UX_ARTICLE_DRAFTS_Article_DraftNumber'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE UNIQUE INDEX
                UX_ARTICLE_DRAFTS_Article_DraftNumber
            ON dbo.ARTICLE_DRAFTS
            (
                ArticleID_FK,
                DraftNumber
            );
        ';
    END;

    ------------------------------------------------------------
    -- Add ARTICLE_VERSIONS source-draft columns
    ------------------------------------------------------------
    IF COL_LENGTH(
        N'dbo.ARTICLE_VERSIONS',
        N'SourceDraftID_FK'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD SourceDraftID_FK uniqueidentifier NULL;
        ';
    END;

    IF COL_LENGTH(
        N'dbo.ARTICLE_VERSIONS',
        N'SourceDraftNumber'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD SourceDraftNumber int NULL;
        ';
    END;

    ------------------------------------------------------------
    -- Add SnapshotReason
    ------------------------------------------------------------
    IF COL_LENGTH(
        N'dbo.ARTICLE_VERSIONS',
        N'SnapshotReason'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD SnapshotReason nvarchar(50) NULL;
        ';
    END;

    EXEC sys.sp_executesql N'
        UPDATE dbo.ARTICLE_VERSIONS
        SET SnapshotReason = N''Published''
        WHERE SnapshotReason IS NULL
           OR LTRIM(RTRIM(SnapshotReason)) = N'''';

        ALTER TABLE dbo.ARTICLE_VERSIONS
        ALTER COLUMN SnapshotReason nvarchar(50) NOT NULL;
    ';

    ------------------------------------------------------------
    -- Add SnapshotReason default
    ------------------------------------------------------------
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.default_constraints AS DC
        INNER JOIN sys.columns AS C
            ON C.object_id = DC.parent_object_id
           AND C.column_id = DC.parent_column_id
        WHERE DC.parent_object_id =
              OBJECT_ID(N'dbo.ARTICLE_VERSIONS')
          AND C.name = N'SnapshotReason'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            ADD CONSTRAINT
                DF_ARTICLE_VERSIONS_SnapshotReason
            DEFAULT (N''Published'')
            FOR SnapshotReason;
        ';
    END;

    ------------------------------------------------------------
    -- Populate SourceDraftNumber where SourceDraftID already exists
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        UPDATE Versions
        SET SourceDraftNumber = Drafts.DraftNumber
        FROM dbo.ARTICLE_VERSIONS AS Versions
        INNER JOIN dbo.ARTICLE_DRAFTS AS Drafts
            ON Drafts.DraftID = Versions.SourceDraftID_FK
        WHERE Versions.SourceDraftID_FK IS NOT NULL
          AND Versions.SourceDraftNumber IS NULL;
    ';

    ------------------------------------------------------------
    -- Link existing published versions to their source drafts
    --
    -- Only execute this optional backfill when the ARTICLES
    -- columns used by the old schema exist.
    ------------------------------------------------------------
    IF COL_LENGTH(
        N'dbo.ARTICLES',
        N'LastPublishedVersionID_FK'
    ) IS NOT NULL
    AND COL_LENGTH(
        N'dbo.ARTICLES',
        N'CurrentDraftID_FK'
    ) IS NOT NULL
    AND COL_LENGTH(
        N'dbo.ARTICLES',
        N'Status'
    ) IS NOT NULL
    AND COL_LENGTH(
        N'dbo.ARTICLE_DRAFTS',
        N'Status'
    ) IS NOT NULL
    BEGIN
        EXEC sys.sp_executesql N'
            UPDATE Versions
            SET
                SourceDraftID_FK = Drafts.DraftID,
                SourceDraftNumber = Drafts.DraftNumber
            FROM dbo.ARTICLE_VERSIONS AS Versions
            INNER JOIN dbo.ARTICLES AS Articles
                ON Articles.LastPublishedVersionID_FK =
                   Versions.VersionID
            INNER JOIN dbo.ARTICLE_DRAFTS AS Drafts
                ON Drafts.DraftID =
                   Articles.CurrentDraftID_FK
               AND Drafts.ArticleID_FK =
                   Versions.ArticleID_FK
            WHERE Versions.SourceDraftID_FK IS NULL
              AND Articles.Status = N''Published''
              AND Drafts.Status = N''Published'';
        ';
    END;
    ELSE
    BEGIN
        PRINT
            'Published-version source draft backfill skipped '
            + 'because one or more legacy columns do not exist.';
    END;

    ------------------------------------------------------------
    -- Clear invalid existing source-draft references
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        UPDATE Versions
        SET SourceDraftID_FK = NULL
        FROM dbo.ARTICLE_VERSIONS AS Versions
        WHERE Versions.SourceDraftID_FK IS NOT NULL
          AND NOT EXISTS
          (
              SELECT 1
              FROM dbo.ARTICLE_DRAFTS AS Drafts
              WHERE Drafts.DraftID =
                    Versions.SourceDraftID_FK
          );
    ';

    ------------------------------------------------------------
    -- Add nullable source-draft foreign key
    ------------------------------------------------------------
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id =
              OBJECT_ID(N'dbo.ARTICLE_VERSIONS')
          AND name =
              N'FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.ARTICLE_VERSIONS
            WITH CHECK
            ADD CONSTRAINT
                FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS
            FOREIGN KEY
            (
                SourceDraftID_FK
            )
            REFERENCES dbo.ARTICLE_DRAFTS
            (
                DraftID
            )
            ON DELETE SET NULL;

            ALTER TABLE dbo.ARTICLE_VERSIONS
            CHECK CONSTRAINT
                FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS;
        ';
    END;

    COMMIT TRANSACTION;

    PRINT
        'Article version-history migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorNumber int = ERROR_NUMBER();
    DECLARE @ErrorLine int = ERROR_LINE();
    DECLARE @ErrorMessage nvarchar(4000) = ERROR_MESSAGE();

    RAISERROR(
        'Article version-history migration failed. Error %d at line %d: %s',
        16,
        1,
        @ErrorNumber,
        @ErrorLine,
        @ErrorMessage
    );
END CATCH;