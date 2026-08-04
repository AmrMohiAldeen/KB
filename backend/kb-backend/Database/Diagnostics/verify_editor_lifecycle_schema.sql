/*
  Read-only editor/lifecycle schema verification.

  Run this against the same database used by Kb.Api. An empty first result set
  means the required baseline tables and columns are present. This script does
  not modify the database and does not replace the incremental migrations.
*/

SET NOCOUNT ON;

DECLARE @RequiredColumns table
(
    TableName sysname NOT NULL,
    ColumnName sysname NOT NULL
);

INSERT INTO @RequiredColumns (TableName, ColumnName)
VALUES
    (N'ARTICLES', N'ArticleID'),
    (N'ARTICLES', N'AuthorID_FK'),
    (N'ARTICLES', N'CurrentDraftID_FK'),
    (N'ARTICLES', N'LastPublishedVersionID_FK'),
    (N'ARTICLES', N'Status'),
    (N'ARTICLES', N'UpdatedAt'),
    (N'ARTICLES', N'DeletedAt'),

    (N'ARTICLE_DRAFTS', N'DraftID'),
    (N'ARTICLE_DRAFTS', N'ArticleID_FK'),
    (N'ARTICLE_DRAFTS', N'DraftNumber'),
    (N'ARTICLE_DRAFTS', N'ContentJsonStoragePath'),
    (N'ARTICLE_DRAFTS', N'RenderedHtmlStoragePath'),
    (N'ARTICLE_DRAFTS', N'PlainTextStoragePath'),
    (N'ARTICLE_DRAFTS', N'ContentHash'),
    (N'ARTICLE_DRAFTS', N'ContentSizeBytes'),
    (N'ARTICLE_DRAFTS', N'RowVersion'),
    (N'ARTICLE_DRAFTS', N'Status'),
    (N'ARTICLE_DRAFTS', N'IsLocked'),
    (N'ARTICLE_DRAFTS', N'LockedBy_FK'),
    (N'ARTICLE_DRAFTS', N'LockedAt'),

    (N'ARTICLE_REVIEW_EVENTS', N'ReviewEventID'),
    (N'ARTICLE_REVIEW_EVENTS', N'ArticleID_FK'),
    (N'ARTICLE_REVIEW_EVENTS', N'DraftID_FK'),
    (N'ARTICLE_REVIEW_EVENTS', N'FromStatus'),
    (N'ARTICLE_REVIEW_EVENTS', N'ToStatus'),
    (N'ARTICLE_REVIEW_EVENTS', N'Action'),
    (N'ARTICLE_REVIEW_EVENTS', N'ActorID_FK'),
    (N'ARTICLE_REVIEW_EVENTS', N'Comment'),
    (N'ARTICLE_REVIEW_EVENTS', N'CreatedAt'),

    (N'ARTICLE_VERSIONS', N'VersionID'),
    (N'ARTICLE_VERSIONS', N'ArticleID_FK'),
    (N'ARTICLE_VERSIONS', N'VersionNumber'),
    (N'ARTICLE_VERSIONS', N'SourceDraftID_FK'),
    (N'ARTICLE_VERSIONS', N'SourceDraftNumber'),
    (N'ARTICLE_VERSIONS', N'SnapshotReason'),
    (N'ARTICLE_VERSIONS', N'ContentJsonStoragePath'),
    (N'ARTICLE_VERSIONS', N'RenderedHtmlStoragePath'),
    (N'ARTICLE_VERSIONS', N'PlainTextStoragePath'),
    (N'ARTICLE_VERSIONS', N'ContentHash'),
    (N'ARTICLE_VERSIONS', N'ContentSizeBytes'),
    (N'ARTICLE_VERSIONS', N'CreatedBy_FK'),
    (N'ARTICLE_VERSIONS', N'CreatedAt'),

    (N'ARTICLE_AUDIT_LOG', N'AuditLogID'),
    (N'ARTICLE_AUDIT_LOG', N'ArticleID_FK'),
    (N'ARTICLE_AUDIT_LOG', N'ActorID_FK'),
    (N'ARTICLE_AUDIT_LOG', N'ActionType'),
    (N'ARTICLE_AUDIT_LOG', N'EntityType'),
    (N'ARTICLE_AUDIT_LOG', N'EntityID'),
    (N'ARTICLE_AUDIT_LOG', N'MetaDataJson'),
    (N'ARTICLE_AUDIT_LOG', N'CreatedAt'),

    (N'SEARCH_INDEX_JOBS', N'SearchJobID'),
    (N'SEARCH_INDEX_JOBS', N'ArticleID_FK'),
    (N'SEARCH_INDEX_JOBS', N'VersionID_FK'),
    (N'SEARCH_INDEX_JOBS', N'JobType'),
    (N'SEARCH_INDEX_JOBS', N'Status'),
    (N'SEARCH_INDEX_JOBS', N'RetryCount'),
    (N'SEARCH_INDEX_JOBS', N'CreatedAt'),

    (N'MEDIA_FILES', N'MediaID'),
    (N'MEDIA_FILES', N'Status'),
    (N'MEDIA_REFERENCES', N'MediaID_FK'),
    (N'MEDIA_REFERENCES', N'ReferenceEntityType'),
    (N'MEDIA_REFERENCES', N'ReferenceEntityID');

SELECT
    Required.TableName,
    Required.ColumnName,
    CASE
        WHEN OBJECT_ID(N'dbo.' + Required.TableName, N'U') IS NULL THEN N'Missing table'
        ELSE N'Missing column'
    END AS Problem
FROM @RequiredColumns AS Required
WHERE OBJECT_ID(N'dbo.' + Required.TableName, N'U') IS NULL
   OR COL_LENGTH(N'dbo.' + Required.TableName, Required.ColumnName) IS NULL
ORDER BY Required.TableName, Required.ColumnName;

SELECT
    DB_NAME() AS DatabaseName,
    @@SERVERNAME AS SqlServerName,
    CAST(SERVERPROPERTY(N'ProductVersion') AS nvarchar(128)) AS SqlServerVersion,
    CAST(DATABASEPROPERTYEX(DB_NAME(), N'CompatibilityLevel') AS int) AS CompatibilityLevel;

IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NOT NULL
BEGIN
    SELECT MigrationId, ProductVersion
    FROM dbo.__EFMigrationsHistory
    ORDER BY MigrationId;
END
ELSE
BEGIN
    SELECT N'dbo.__EFMigrationsHistory is missing' AS MigrationHistoryWarning;
END;
