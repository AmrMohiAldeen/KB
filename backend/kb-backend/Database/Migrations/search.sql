USE KB;
GO

------------------------------------------------------------
-- CATEGORIES.Visibility
------------------------------------------------------------

IF COL_LENGTH('dbo.CATEGORIES', 'Visibility') IS NULL
BEGIN
    ALTER TABLE dbo.CATEGORIES
    ADD Visibility nvarchar(20) NOT NULL
        CONSTRAINT DF_CATEGORIES_Visibility DEFAULT N'Public';
END;
GO

IF OBJECT_ID(N'dbo.CK_CATEGORIES_Visibility', N'C') IS NULL
BEGIN
    ALTER TABLE dbo.CATEGORIES
    ADD CONSTRAINT CK_CATEGORIES_Visibility
    CHECK (Visibility IN (N'Public', N'Internal'));
END;
GO


------------------------------------------------------------
-- ARTICLES.Visibility
------------------------------------------------------------

IF COL_LENGTH('dbo.ARTICLES', 'Visibility') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLES
    ADD Visibility nvarchar(20) NOT NULL
        CONSTRAINT DF_ARTICLES_Visibility DEFAULT N'Public';
END;
GO

IF OBJECT_ID(N'dbo.CK_ARTICLES_Visibility', N'C') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLES
    ADD CONSTRAINT CK_ARTICLES_Visibility
    CHECK (Visibility IN (N'Public', N'Internal'));
END;
GO


------------------------------------------------------------
-- SEARCH_INDEX_JOBS.IndexScope
------------------------------------------------------------

IF COL_LENGTH('dbo.SEARCH_INDEX_JOBS', 'IndexScope') IS NULL
BEGIN
    ALTER TABLE dbo.SEARCH_INDEX_JOBS
    ADD IndexScope nvarchar(30) NULL;
END;
GO

UPDATE dbo.SEARCH_INDEX_JOBS
SET IndexScope = N'Internal'
WHERE IndexScope IS NULL;
GO

ALTER TABLE dbo.SEARCH_INDEX_JOBS
ALTER COLUMN IndexScope nvarchar(30) NOT NULL;
GO


------------------------------------------------------------
-- SEARCH_INDEX_JOBS.AvailableAt
------------------------------------------------------------

IF COL_LENGTH('dbo.SEARCH_INDEX_JOBS', 'AvailableAt') IS NULL
BEGIN
    ALTER TABLE dbo.SEARCH_INDEX_JOBS
    ADD AvailableAt datetime2(3) NULL;
END;
GO

UPDATE dbo.SEARCH_INDEX_JOBS
SET AvailableAt = SYSUTCDATETIME()
WHERE AvailableAt IS NULL;
GO

ALTER TABLE dbo.SEARCH_INDEX_JOBS
ALTER COLUMN AvailableAt datetime2(3) NOT NULL;
GO