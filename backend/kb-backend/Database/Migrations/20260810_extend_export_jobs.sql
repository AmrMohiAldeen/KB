use [KB];
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.EXPORT_JOBS', 'CategoryID_FK') IS NULL
    ALTER TABLE dbo.EXPORT_JOBS ADD CategoryID_FK uniqueidentifier NULL;

IF COL_LENGTH('dbo.EXPORT_JOBS', 'EntityType') IS NULL
    ALTER TABLE dbo.EXPORT_JOBS ADD EntityType nvarchar(30) NULL;

IF COL_LENGTH('dbo.EXPORT_JOBS', 'StartedAt') IS NULL
    ALTER TABLE dbo.EXPORT_JOBS ADD StartedAt datetime2(3) NULL;

IF COL_LENGTH('dbo.EXPORT_JOBS', 'CompletedAt') IS NULL
    ALTER TABLE dbo.EXPORT_JOBS ADD CompletedAt datetime2(3) NULL;

IF COL_LENGTH('dbo.EXPORT_JOBS', 'SnapshotJson') IS NULL
    ALTER TABLE dbo.EXPORT_JOBS ADD SnapshotJson nvarchar(max) NULL;

IF COL_LENGTH('dbo.EXPORT_JOBS', 'FileName') IS NULL
    ALTER TABLE dbo.EXPORT_JOBS ADD FileName nvarchar(260) NULL;

GO

UPDATE dbo.EXPORT_JOBS
SET EntityType=N'Article'
WHERE EntityType IS NULL;

UPDATE dbo.EXPORT_JOBS
SET SnapshotJson=N'{}',
    Status=N'Failed',
    ErrorMessage=COALESCE(
        ErrorMessage,
        N'This export predates stable snapshot support. Request it again.'
    ),
    CompletedAt=COALESCE(CompletedAt,sysutcdatetime())
WHERE SnapshotJson IS NULL;

UPDATE dbo.EXPORT_JOBS
SET FileName=CONCAT(
    N'article-export.',
    CASE WHEN ExportType=N'PDF' THEN N'pdf' ELSE N'html' END
)
WHERE FileName IS NULL;