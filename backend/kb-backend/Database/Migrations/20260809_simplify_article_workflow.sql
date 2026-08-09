SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE dbo.ARTICLES
SET Status = N'SubmittedForReview'
WHERE Status = N'Resubmitted';

UPDATE dbo.ARTICLE_DRAFTS
SET Status = N'SubmittedForReview'
WHERE Status = N'Resubmitted';

UPDATE dbo.ARTICLE_REVIEW_EVENTS
SET FromStatus = CASE WHEN FromStatus = N'Resubmitted' THEN N'SubmittedForReview' ELSE FromStatus END,
    ToStatus = CASE WHEN ToStatus = N'Resubmitted' THEN N'SubmittedForReview' ELSE ToStatus END,
    [Action] = CASE WHEN [Action] = N'Resubmit' THEN N'SubmitForReview' ELSE [Action] END
WHERE FromStatus = N'Resubmitted'
   OR ToStatus = N'Resubmitted'
   OR [Action] = N'Resubmit';

UPDATE dbo.ARTICLE_VERSIONS
SET SnapshotReason = N'SubmittedForReview'
WHERE SnapshotReason = N'ResubmittedForReview';

UPDATE dbo.ARTICLE_AUDIT_LOG
SET ActionType = N'ArticleSubmittedForReview',
    MetaDataJSON = REPLACE(REPLACE(REPLACE(MetaDataJSON,
        N'ArticleResubmitted', N'ArticleSubmittedForReview'),
        N'ResubmittedForReview', N'SubmittedForReview'),
        N'Resubmitted', N'SubmittedForReview')
WHERE ActionType = N'ArticleResubmitted'
   OR MetaDataJSON LIKE N'%Resubmit%';

COMMIT TRANSACTION;
