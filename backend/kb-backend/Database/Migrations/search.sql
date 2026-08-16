use [KB];
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- IndexScope
    ------------------------------------------------------------
    IF COL_LENGTH('dbo.SEARCH_INDEX_JOBS', 'IndexScope') IS NULL
    BEGIN
        ALTER TABLE dbo.SEARCH_INDEX_JOBS
        ADD IndexScope nvarchar(30) NULL;
    END;

    UPDATE dbo.SEARCH_INDEX_JOBS
    SET IndexScope = N'Internal'
    WHERE IndexScope IS NULL
       OR LTRIM(RTRIM(IndexScope)) = N'';

    ALTER TABLE dbo.SEARCH_INDEX_JOBS
    ALTER COLUMN IndexScope nvarchar(30) NOT NULL;

    IF OBJECT_ID(
        N'dbo.DF_SEARCH_INDEX_JOBS_IndexScope',
        N'D'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.SEARCH_INDEX_JOBS
        ADD CONSTRAINT DF_SEARCH_INDEX_JOBS_IndexScope
        DEFAULT N'Internal' FOR IndexScope;
    END;


    ------------------------------------------------------------
    -- AvailableAt
    ------------------------------------------------------------
    IF COL_LENGTH('dbo.SEARCH_INDEX_JOBS', 'AvailableAt') IS NULL
    BEGIN
        ALTER TABLE dbo.SEARCH_INDEX_JOBS
        ADD AvailableAt datetime2(3) NULL;
    END;

    UPDATE dbo.SEARCH_INDEX_JOBS
    SET AvailableAt = SYSUTCDATETIME()
    WHERE AvailableAt IS NULL;

    ALTER TABLE dbo.SEARCH_INDEX_JOBS
    ALTER COLUMN AvailableAt datetime2(3) NOT NULL;

    IF OBJECT_ID(
        N'dbo.DF_SEARCH_INDEX_JOBS_AvailableAt',
        N'D'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.SEARCH_INDEX_JOBS
        ADD CONSTRAINT DF_SEARCH_INDEX_JOBS_AvailableAt
        DEFAULT SYSUTCDATETIME() FOR AvailableAt;
    END;


    ------------------------------------------------------------
    -- Useful worker polling index
    ------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.SEARCH_INDEX_JOBS')
          AND name = N'IX_SEARCH_INDEX_JOBS_Poll'
    )
    BEGIN
        CREATE INDEX IX_SEARCH_INDEX_JOBS_Poll
        ON dbo.SEARCH_INDEX_JOBS
        (
            IndexScope,
            Status,
            AvailableAt
        )
        INCLUDE
        (
            ProcessedAt
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;