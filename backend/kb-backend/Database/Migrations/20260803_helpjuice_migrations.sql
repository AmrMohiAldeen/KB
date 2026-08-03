SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.MIGRATION_JOBS
(
    MigrationJobID uniqueidentifier NOT NULL CONSTRAINT PK_MIGRATION_JOBS PRIMARY KEY
        CONSTRAINT DF_MIGRATION_JOBS_ID DEFAULT newsequentialid(),
    Type nvarchar(50) NOT NULL,
    Status nvarchar(50) NOT NULL,
    OriginalFileName nvarchar(260) NOT NULL,
    PackageStoragePath nvarchar(1024) NOT NULL,
    RequestedByUserId uniqueidentifier NOT NULL,
    RequestedAt datetime2(3) NOT NULL,
    StartedAt datetime2(3) NULL,
    CompletedAt datetime2(3) NULL,
    CurrentPhase nvarchar(100) NOT NULL,
    TotalItems int NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Total DEFAULT 0,
    ProcessedItems int NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Processed DEFAULT 0,
    ImportedItems int NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Imported DEFAULT 0,
    UpdatedItems int NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Updated DEFAULT 0,
    SkippedItems int NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Skipped DEFAULT 0,
    FailedItems int NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Failed DEFAULT 0,
    OptionsJSON nvarchar(max) NOT NULL,
    CancellationRequested bit NOT NULL CONSTRAINT DF_MIGRATION_JOBS_Cancel DEFAULT 0,
    ValidationSummaryJSON nvarchar(max) NULL,
    SummaryJSON nvarchar(max) NULL,
    FailureCode nvarchar(100) NULL,
    FailureMessage nvarchar(4000) NULL,
    RowVersion rowversion NOT NULL,
    CONSTRAINT FK_MIGRATION_JOBS_USERS FOREIGN KEY (RequestedByUserId) REFERENCES dbo.USERS(UserID)
);
CREATE INDEX IX_MIGRATION_JOBS_Status_RequestedAt ON dbo.MIGRATION_JOBS(Status, RequestedAt);

CREATE TABLE dbo.MIGRATION_JOB_ERRORS
(
    MigrationJobErrorID uniqueidentifier NOT NULL CONSTRAINT PK_MIGRATION_JOB_ERRORS PRIMARY KEY
        CONSTRAINT DF_MIGRATION_JOB_ERRORS_ID DEFAULT newsequentialid(),
    MigrationJobId uniqueidentifier NOT NULL,
    Severity nvarchar(20) NOT NULL,
    FileName nvarchar(260) NULL,
    RowNumber int NULL,
    ExternalEntityType nvarchar(100) NULL,
    ExternalId nvarchar(500) NULL,
    ErrorCode nvarchar(100) NOT NULL,
    Message nvarchar(4000) NOT NULL,
    SourceDataSummary nvarchar(4000) NULL,
    CreatedAt datetime2(3) NOT NULL,
    CONSTRAINT FK_MIGRATION_JOB_ERRORS_JOBS FOREIGN KEY (MigrationJobId)
        REFERENCES dbo.MIGRATION_JOBS(MigrationJobID) ON DELETE CASCADE
);
CREATE INDEX IX_MIGRATION_JOB_ERRORS_Job_Severity_CreatedAt
    ON dbo.MIGRATION_JOB_ERRORS(MigrationJobId, Severity, CreatedAt);

CREATE TABLE dbo.MIGRATION_EXTERNAL_MAPPINGS
(
    MigrationExternalMappingID uniqueidentifier NOT NULL CONSTRAINT PK_MIGRATION_EXTERNAL_MAPPINGS PRIMARY KEY
        CONSTRAINT DF_MIGRATION_EXTERNAL_MAPPINGS_ID DEFAULT newsequentialid(),
    MigrationJobId uniqueidentifier NOT NULL,
    SourceSystem nvarchar(50) NOT NULL,
    ExternalEntityType nvarchar(100) NOT NULL,
    ExternalId nvarchar(500) NOT NULL,
    InternalEntityId uniqueidentifier NOT NULL,
    MetadataJson nvarchar(max) NULL,
    CreatedAt datetime2(3) NOT NULL,
    CONSTRAINT FK_MIGRATION_EXTERNAL_MAPPINGS_JOBS FOREIGN KEY (MigrationJobId)
        REFERENCES dbo.MIGRATION_JOBS(MigrationJobID) ON DELETE CASCADE,
    CONSTRAINT UX_MIGRATION_EXTERNAL_MAPPINGS_Source UNIQUE(MigrationJobId, ExternalEntityType, ExternalId)
);

COMMIT TRANSACTION;
