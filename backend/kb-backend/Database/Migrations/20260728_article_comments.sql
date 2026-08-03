/*
  Article comments: permanent article ownership, optional draft lineage,
  anchor health, optimistic concurrency, explicit moderation, and draft-delete guard.
  SQL Server; safe to rerun after a partially completed execution.
*/

IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'CurrentDraftID_FK') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD CurrentDraftID_FK uniqueidentifier NULL;
END;

IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'OriginDraftID_FK') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD OriginDraftID_FK uniqueidentifier NULL;
END;

IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'AnchorDataJSON') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD AnchorDataJSON nvarchar(max) NULL;

    IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'AnchorJson') IS NOT NULL
    BEGIN
        EXEC (
            'UPDATE dbo.ARTICLE_COMMENTS
             SET AnchorDataJSON = AnchorJson
             WHERE AnchorDataJSON IS NULL;'
        );
    END;
END;

IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'AnchorStatus') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD AnchorStatus nvarchar(50) NOT NULL
            CONSTRAINT DF_ARTICLE_COMMENTS_AnchorStatus
            DEFAULT ('Attached');
END;

IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'UpdatedAt') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD UpdatedAt datetime2(3) NOT NULL
            CONSTRAINT DF_ARTICLE_COMMENTS_UpdatedAt
            DEFAULT (sysutcdatetime());

    UPDATE dbo.ARTICLE_COMMENTS
    SET UpdatedAt = CreatedAt;
END;

IF COL_LENGTH('dbo.ARTICLE_COMMENTS', 'RowVersion') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD RowVersion rowversion NOT NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS'
      AND parent_object_id = OBJECT_ID('dbo.ARTICLE_COMMENTS')
)
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD CONSTRAINT FK_ARTICLE_COMMENTS_CurrentDraft_ARTICLE_DRAFTS
            FOREIGN KEY (CurrentDraftID_FK)
            REFERENCES dbo.ARTICLE_DRAFTS(DraftID)
            ON DELETE SET NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS'
      AND parent_object_id = OBJECT_ID('dbo.ARTICLE_COMMENTS')
)
BEGIN
    ALTER TABLE dbo.ARTICLE_COMMENTS
        ADD CONSTRAINT FK_ARTICLE_COMMENTS_OriginDraft_ARTICLE_DRAFTS
            FOREIGN KEY (OriginDraftID_FK)
            REFERENCES dbo.ARTICLE_DRAFTS(DraftID)
            ON DELETE SET NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ARTICLE_COMMENTS_CurrentDraftID_FK'
      AND object_id = OBJECT_ID('dbo.ARTICLE_COMMENTS')
)
BEGIN
    CREATE INDEX IX_ARTICLE_COMMENTS_CurrentDraftID_FK
        ON dbo.ARTICLE_COMMENTS(CurrentDraftID_FK)
        WHERE CurrentDraftID_FK IS NOT NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ARTICLE_COMMENTS_OriginDraftID_FK'
      AND object_id = OBJECT_ID('dbo.ARTICLE_COMMENTS')
)
BEGIN
    CREATE INDEX IX_ARTICLE_COMMENTS_OriginDraftID_FK
        ON dbo.ARTICLE_COMMENTS(OriginDraftID_FK)
        WHERE OriginDraftID_FK IS NOT NULL;
END;

INSERT INTO dbo.ROLE_PERMISSIONS (
    RoleID_FK,
    PermissionCode
)
SELECT
    r.RoleID,
    'comments.moderate'
FROM dbo.ROLES r
WHERE r.RoleName IN ('Admin', 'Reviewer')
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.ROLE_PERMISSIONS existing
      WHERE existing.RoleID_FK = r.RoleID
        AND existing.PermissionCode = 'comments.moderate'
  );

GO

CREATE OR ALTER TRIGGER dbo.TR_ARTICLE_DRAFTS_BlockUnresolvedCommentDelete
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
          AND c.Status = 'Open'
    )
    BEGIN
        THROW 51001,
            'A draft with unresolved dependent comments cannot be deleted.',
            1;
    END;

    DELETE drafts
    FROM dbo.ARTICLE_DRAFTS drafts
    INNER JOIN deleted d
        ON d.DraftID = drafts.DraftID;
END;

GO