SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Published content belongs to ARTICLE_VERSIONS. The source draft remains the
-- final approved review artifact.
UPDATE dbo.ARTICLE_DRAFTS
SET Status = N'Approved'
WHERE Status = N'Published';

-- Keep this migration safe to apply even if the workflow-simplification
-- migration has not yet normalized legacy rows.
UPDATE dbo.ARTICLES
SET Status = N'SubmittedForReview'
WHERE Status = N'Resubmitted';

UPDATE dbo.ARTICLE_DRAFTS
SET Status = N'SubmittedForReview'
WHERE Status = N'Resubmitted';

IF EXISTS
(
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.ARTICLES')
      AND name = N'CK_ARTICLES_Status'
)
BEGIN
    ALTER TABLE dbo.ARTICLES DROP CONSTRAINT CK_ARTICLES_Status;
END;

ALTER TABLE dbo.ARTICLES WITH CHECK
ADD CONSTRAINT CK_ARTICLES_Status CHECK
(
    Status IN
    (
        N'Draft',
        N'SubmittedForReview',
        N'InReview',
        N'ChangesRequested',
        N'Approved',
        N'Published',
        N'Archived',
        N'Deleted'
    )
);

ALTER TABLE dbo.ARTICLES CHECK CONSTRAINT CK_ARTICLES_Status;

IF EXISTS
(
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.ARTICLE_DRAFTS')
      AND name = N'CK_ARTICLE_DRAFTS_Status'
)
BEGIN
    ALTER TABLE dbo.ARTICLE_DRAFTS DROP CONSTRAINT CK_ARTICLE_DRAFTS_Status;
END;

ALTER TABLE dbo.ARTICLE_DRAFTS WITH CHECK
ADD CONSTRAINT CK_ARTICLE_DRAFTS_Status CHECK
(
    Status IN
    (
        N'Draft',
        N'SubmittedForReview',
        N'InReview',
        N'ChangesRequested',
        N'Approved',
        N'Archived',
        N'Deleted'
    )
);

ALTER TABLE dbo.ARTICLE_DRAFTS CHECK CONSTRAINT CK_ARTICLE_DRAFTS_Status;

COMMIT TRANSACTION;
