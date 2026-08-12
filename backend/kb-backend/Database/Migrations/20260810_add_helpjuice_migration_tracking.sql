SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.MIGRATION_JOBS', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MIGRATION_JOBS (
        MigrationJobID uniqueidentifier NOT NULL CONSTRAINT PK_MIGRATION_JOBS PRIMARY KEY,
        SourceSystem nvarchar(50) NOT NULL,
        PackageHash nvarchar(128) NOT NULL,
        Status nvarchar(50) NOT NULL,
        RequestedBy_FK uniqueidentifier NOT NULL,
        OptionsJson nvarchar(max) NULL,
        SummaryJson nvarchar(max) NULL,
        StartedAt datetime2(3) NOT NULL,
        CompletedAt datetime2(3) NULL,
        CONSTRAINT FK_MIGRATION_JOBS_USERS FOREIGN KEY (RequestedBy_FK) REFERENCES dbo.USERS(UserID)
    );
    CREATE INDEX IX_MIGRATION_JOBS_Source_PackageHash ON dbo.MIGRATION_JOBS(SourceSystem, PackageHash);
END;

IF OBJECT_ID(N'dbo.MIGRATION_EXTERNAL_MAPPINGS', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MIGRATION_EXTERNAL_MAPPINGS (
        MappingID uniqueidentifier NOT NULL CONSTRAINT PK_MIGRATION_EXTERNAL_MAPPINGS PRIMARY KEY,
        SourceSystem nvarchar(50) NOT NULL,
        ExternalEntityType nvarchar(50) NOT NULL,
        ExternalId nvarchar(200) NOT NULL,
        InternalID uniqueidentifier NOT NULL,
        ContentHash nvarchar(128) NULL,
        MetadataJson nvarchar(max) NULL,
        CreatedAt datetime2(3) NOT NULL,
        UpdatedAt datetime2(3) NOT NULL
    );
    CREATE UNIQUE INDEX UX_MIGRATION_EXTERNAL_MAPPINGS_Source_Entity_ExternalId
        ON dbo.MIGRATION_EXTERNAL_MAPPINGS(SourceSystem, ExternalEntityType, ExternalId);
END;

IF OBJECT_ID(N'dbo.MIGRATION_JOB_ERRORS', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MIGRATION_JOB_ERRORS (
        MigrationIssueID uniqueidentifier NOT NULL CONSTRAINT PK_MIGRATION_JOB_ERRORS PRIMARY KEY,
        MigrationJobID_FK uniqueidentifier NOT NULL,
        Severity nvarchar(20) NOT NULL,
        FileName nvarchar(260) NULL,
        RowNumber int NULL,
        ExternalEntityType nvarchar(50) NULL,
        ExternalId nvarchar(200) NULL,
        ErrorCode nvarchar(100) NOT NULL,
        Message nvarchar(4000) NOT NULL,
        SourceDataSummary nvarchar(max) NULL,
        CreatedAt datetime2(3) NOT NULL,
        CONSTRAINT FK_MIGRATION_JOB_ERRORS_JOBS FOREIGN KEY (MigrationJobID_FK)
            REFERENCES dbo.MIGRATION_JOBS(MigrationJobID) ON DELETE CASCADE
    );
    CREATE INDEX IX_MIGRATION_JOB_ERRORS_Job_Severity_Code
        ON dbo.MIGRATION_JOB_ERRORS(MigrationJobID_FK, Severity, ErrorCode);
END;

COMMIT TRANSACTION;
