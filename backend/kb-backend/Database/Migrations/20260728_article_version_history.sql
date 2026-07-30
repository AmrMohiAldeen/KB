SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.ARTICLE_DRAFTS', 'DraftNumber') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_DRAFTS ADD DraftNumber int NULL;

    ;WITH numbered AS
    (
        SELECT DraftID,
               ROW_NUMBER() OVER (
                   PARTITION BY ArticleID_FK
                   ORDER BY CreatedAt, DraftID) AS DraftNumber
        FROM dbo.ARTICLE_DRAFTS
    )
    UPDATE drafts
    SET DraftNumber = numbered.DraftNumber
    FROM dbo.ARTICLE_DRAFTS AS drafts
    INNER JOIN numbered ON numbered.DraftID = drafts.DraftID;

    ALTER TABLE dbo.ARTICLE_DRAFTS ALTER COLUMN DraftNumber int NOT NULL;
    ALTER TABLE dbo.ARTICLE_DRAFTS
        ADD CONSTRAINT DF_ARTICLE_DRAFTS_DraftNumber DEFAULT (1) FOR DraftNumber;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ARTICLE_DRAFTS')
      AND name = 'UX_ARTICLE_DRAFTS_Article_DraftNumber')
BEGIN
    CREATE UNIQUE INDEX UX_ARTICLE_DRAFTS_Article_DraftNumber
        ON dbo.ARTICLE_DRAFTS (ArticleID_FK, DraftNumber);
END;

IF COL_LENGTH('dbo.ARTICLE_VERSIONS', 'SourceDraftID_FK') IS NULL
    ALTER TABLE dbo.ARTICLE_VERSIONS ADD SourceDraftID_FK uniqueidentifier NULL;

IF COL_LENGTH('dbo.ARTICLE_VERSIONS', 'SourceDraftNumber') IS NULL
    ALTER TABLE dbo.ARTICLE_VERSIONS ADD SourceDraftNumber int NULL;

IF COL_LENGTH('dbo.ARTICLE_VERSIONS', 'SnapshotReason') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLE_VERSIONS
        ADD SnapshotReason nvarchar(50) NOT NULL
            CONSTRAINT DF_ARTICLE_VERSIONS_SnapshotReason DEFAULT ('Published');
END;

-- The currently published legacy version can be linked safely when the current
-- draft is still the published draft. Older historical versions remain nullable.
UPDATE versions
SET SourceDraftID_FK = drafts.DraftID,
    SourceDraftNumber = drafts.DraftNumber
FROM dbo.ARTICLE_VERSIONS AS versions
INNER JOIN dbo.ARTICLES AS articles
    ON articles.LastPublishedVersionID_FK = versions.VersionID
INNER JOIN dbo.ARTICLE_DRAFTS AS drafts
    ON drafts.DraftID = articles.CurrentDraftID_FK
   AND drafts.ArticleID_FK = versions.ArticleID_FK
WHERE versions.SourceDraftID_FK IS NULL
  AND articles.Status = 'Published'
  AND drafts.Status = 'Published';

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.ARTICLE_VERSIONS')
      AND name = 'FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS')
BEGIN
    ALTER TABLE dbo.ARTICLE_VERSIONS WITH CHECK
        ADD CONSTRAINT FK_ARTICLE_VERSIONS_SourceDraft_ARTICLE_DRAFTS
        FOREIGN KEY (SourceDraftID_FK)
        REFERENCES dbo.ARTICLE_DRAFTS (DraftID)
        ON DELETE SET NULL;
END;

COMMIT TRANSACTION;
