/*
  Article comments migration — SSMS-compatible corrected version.

  Fixes:
  - Uses dynamic SQL after adding columns so SQL Server does not compile
    references to columns before those columns exist.
  - Avoids THROW for compatibility with older database compatibility levels.
  - Creates the trigger through dynamic SQL, so CREATE TRIGGER does not need
    to be the only statement in the outer SSMS batch.
  - Uses NO ACTION foreign keys. The INSTEAD OF DELETE trigger manually clears
    resolved/deleted comment draft references before deleting a draft.
  - Safe to rerun after a partially completed execution.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ARTICLE_COMMENTS', N'U') IS NULL
BEGIN
    RAISERROR('Required table dbo.ARTICLE_COMMENTS does not exist.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.ARTICLE_DRAFTS', N'U') IS NULL
BEGIN
    RAISERROR('Required table dbo.ARTICLE_DRAFTS does not exist.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.ROLES', N'U') IS NULL
BEGIN
    RAISERROR('Required table dbo.ROLES does not exist.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.ROLE_PERMISSIONS', N'U') IS NULL
BEGIN
    RAISERROR('Required table dbo.ROLE_PERMISSIONS does not exist.', 16, 1);
    RETURN;
END;

IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'CreatedAt') IS NULL
BEGIN
    RAISERROR('Required column dbo.ARTICLE_COMMENTS.CreatedAt does not exist.', 16, 1);
    RETURN;
END;

IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'ParentCommentID_FK') IS NULL
BEGIN
    RAISERROR('Required column dbo.ARTICLE_COMMENTS.ParentCommentID_FK does not exist.', 16, 1);
    RETURN;
END;

IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'DeletedAt') IS NULL
BEGIN
    RAISERROR('Required column dbo.ARTICLE_COMMENTS.DeletedAt does not exist.', 16, 1);
    RETURN;
END;

IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'Status') IS NULL
BEGIN
    RAISERROR('Required column dbo.ARTICLE_COMMENTS.Status does not exist.', 16, 1);
    RETURN;
END;

IF COL_LENGTH(N'dbo.ARTICLE_DRAFTS', N'DraftID') IS NULL
BEGIN
    RAISERROR('Required column dbo.ARTICLE_DRAFTS.DraftID does not exist.', 16, 1);
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    ---------------------------------------------------------------------------
    -- Remove the old trigger first, if a partial migration already created it.
    ---------------------------------------------------------------------------
    IF OBJECT_ID(N'dbo.TR_ARTICLE_DRAFTS_BlockUnresolvedCommentDelete', N'TR') IS NOT NULL
    BEGIN
        EXEC(N'DROP TRIGGER dbo.TR_ARTICLE_DRAFTS_BlockUnresolvedCommentDelete;');
    END;

    ---------------------------------------------------------------------------
    -- Draft lineage columns
    ---------------------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'CurrentDraftID_FK') IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD CurrentDraftID_FK uniqueidentifier NULL;
        ');
    END;

    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'OriginDraftID_FK') IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD OriginDraftID_FK uniqueidentifier NULL;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Anchor data
    ---------------------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'AnchorDataJSON') IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD AnchorDataJSON nvarchar(max) NULL;
        ');
    END;

    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'AnchorJson') IS NOT NULL
    BEGIN
        EXEC(N'
            UPDATE dbo.ARTICLE_COMMENTS
            SET AnchorDataJSON = AnchorJson
            WHERE AnchorDataJSON IS NULL
              AND AnchorJson IS NOT NULL;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Anchor status
    ---------------------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'AnchorStatus') IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD AnchorStatus nvarchar(50) NULL;
        ');
    END;

    EXEC(N'
        UPDATE dbo.ARTICLE_COMMENTS
        SET AnchorStatus = N''Attached''
        WHERE AnchorStatus IS NULL;
    ');

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
          AND name = N'AnchorStatus'
          AND is_nullable = 1
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ALTER COLUMN AnchorStatus nvarchar(50) NOT NULL;
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
            ON c.object_id = dc.parent_object_id
           AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
          AND c.name = N'AnchorStatus'
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD CONSTRAINT DF_ARTICLE_COMMENTS_AnchorStatus
                DEFAULT (N''Attached'') FOR AnchorStatus;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Updated timestamp
    ---------------------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'UpdatedAt') IS NULL
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD UpdatedAt datetime2(3) NULL;
        ');
    END;

    EXEC(N'
        UPDATE dbo.ARTICLE_COMMENTS
        SET UpdatedAt = COALESCE(CreatedAt, SYSUTCDATETIME())
        WHERE UpdatedAt IS NULL;
    ');

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
          AND name = N'UpdatedAt'
          AND is_nullable = 1
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ALTER COLUMN UpdatedAt datetime2(3) NOT NULL;
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
            ON c.object_id = dc.parent_object_id
           AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
          AND c.name = N'UpdatedAt'
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD CONSTRAINT DF_ARTICLE_COMMENTS_UpdatedAt
                DEFAULT (SYSUTCDATETIME()) FOR UpdatedAt;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Optimistic concurrency
    ---------------------------------------------------------------------------
    IF COL_LENGTH(N'dbo.ARTICLE_COMMENTS', N'RowVersion') IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM sys.columns
            WHERE object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
              AND system_type_id = 189
        )
        BEGIN
            RAISERROR(
                'dbo.ARTICLE_COMMENTS already has a rowversion/timestamp column with another name.',
                16,
                1
            );
        END;

        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            ADD RowVersion rowversion NOT NULL;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Foreign keys
    --
    -- These must use NO ACTION. The delete trigger below performs the guarded
    -- SET NULL operation manually before deleting an eligible draft.
    ---------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = N'FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS'
          AND parent_object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
          AND delete_referential_action <> 0
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            DROP CONSTRAINT FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS;
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = N'FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS'
          AND parent_object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS WITH CHECK
            ADD CONSTRAINT FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS
                FOREIGN KEY (CurrentDraftID_FK)
                REFERENCES dbo.ARTICLE_DRAFTS(DraftID);
        ');

        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            CHECK CONSTRAINT FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS;
        ');
    END;

    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = N'FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS'
          AND parent_object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
          AND delete_referential_action <> 0
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            DROP CONSTRAINT FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS;
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = N'FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS'
          AND parent_object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS WITH CHECK
            ADD CONSTRAINT FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS
                FOREIGN KEY (OriginDraftID_FK)
                REFERENCES dbo.ARTICLE_DRAFTS(DraftID);
        ');

        EXEC(N'
            ALTER TABLE dbo.ARTICLE_COMMENTS
            CHECK CONSTRAINT FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Indexes
    ---------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = N'IX_ARTICLE_COMMENTS_CurrentDraftID_FK'
          AND object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
    )
    BEGIN
        EXEC(N'
            CREATE INDEX IX_ARTICLE_COMMENTS_CurrentDraftID_FK
            ON dbo.ARTICLE_COMMENTS(CurrentDraftID_FK)
            WHERE CurrentDraftID_FK IS NOT NULL;
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = N'IX_ARTICLE_COMMENTS_OriginDraftID_FK'
          AND object_id = OBJECT_ID(N'dbo.ARTICLE_COMMENTS')
    )
    BEGIN
        EXEC(N'
            CREATE INDEX IX_ARTICLE_COMMENTS_OriginDraftID_FK
            ON dbo.ARTICLE_COMMENTS(OriginDraftID_FK)
            WHERE OriginDraftID_FK IS NOT NULL;
        ');
    END;

    ---------------------------------------------------------------------------
    -- Moderation permission
    ---------------------------------------------------------------------------
    INSERT INTO dbo.ROLE_PERMISSIONS (
        RoleID_FK,
        PermissionCode
    )
    SELECT
        r.RoleID,
        N'comments.moderate'
    FROM dbo.ROLES r
    WHERE r.RoleName IN (N'Admin', N'Reviewer')
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.ROLE_PERMISSIONS existing
          WHERE existing.RoleID_FK = r.RoleID
            AND existing.PermissionCode = N'comments.moderate'
      );

    ---------------------------------------------------------------------------
    -- Draft-delete guard
    --
    -- CREATE TRIGGER is executed as its own dynamic batch. RAISERROR is used
    -- instead of THROW for compatibility with older compatibility levels.
    ---------------------------------------------------------------------------
    EXEC(N'
        CREATE TRIGGER dbo.TR_ARTICLE_DRAFTS_BlockUnresolvedCommentDelete
        ON dbo.ARTICLE_DRAFTS
        INSTEAD OF DELETE
        AS
        BEGIN
            SET NOCOUNT ON;

            IF EXISTS (
                SELECT 1
                FROM deleted d
                INNER JOIN dbo.ARTICLE_COMMENTS c
                    ON c.CurrentDraftID_FK = d.DraftID
                    OR c.OriginDraftID_FK = d.DraftID
                WHERE c.ParentCommentID_FK IS NULL
                  AND c.DeletedAt IS NULL
                  AND c.Status = N''Open''
            )
            BEGIN
                RAISERROR(
                    ''A draft with unresolved dependent comments cannot be deleted.'',
                    16,
                    1
                );
                RETURN;
            END;

            UPDATE c
            SET
                CurrentDraftID_FK = CASE
                    WHEN c.CurrentDraftID_FK IN (SELECT DraftID FROM deleted)
                        THEN NULL
                    ELSE c.CurrentDraftID_FK
                END,
                OriginDraftID_FK = CASE
                    WHEN c.OriginDraftID_FK IN (SELECT DraftID FROM deleted)
                        THEN NULL
                    ELSE c.OriginDraftID_FK
                END,
                UpdatedAt = SYSUTCDATETIME()
            FROM dbo.ARTICLE_COMMENTS c
            WHERE c.CurrentDraftID_FK IN (SELECT DraftID FROM deleted)
               OR c.OriginDraftID_FK IN (SELECT DraftID FROM deleted);

            DELETE drafts
            FROM dbo.ARTICLE_DRAFTS drafts
            INNER JOIN deleted d
                ON d.DraftID = drafts.DraftID;
        END;
    ');

    COMMIT TRANSACTION;

    PRINT 'Article comments migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage nvarchar(2048) = ERROR_MESSAGE();
    DECLARE @ErrorNumber int = ERROR_NUMBER();
    DECLARE @ErrorLine int = ERROR_LINE();

    RAISERROR(
        'Article comments migration failed: %s (error %d, line %d).',
        16,
        1,
        @ErrorMessage,
        @ErrorNumber,
        @ErrorLine
    );
END CATCH;
