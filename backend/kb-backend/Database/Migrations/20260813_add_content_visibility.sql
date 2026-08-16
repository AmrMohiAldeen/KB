SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- CATEGORIES.Visibility
    ------------------------------------------------------------
    IF COL_LENGTH('dbo.CATEGORIES', 'Visibility') IS NULL
    BEGIN
        ALTER TABLE dbo.CATEGORIES
        ADD Visibility nvarchar(20) NOT NULL
            CONSTRAINT DF_CATEGORIES_Visibility DEFAULT N'Public';
    END;

    IF OBJECT_ID(N'dbo.CK_CATEGORIES_Visibility', N'C') IS NULL
    BEGIN
        ALTER TABLE dbo.CATEGORIES
        ADD CONSTRAINT CK_CATEGORIES_Visibility
        CHECK (Visibility IN (N'Public', N'Internal'));
    END;


    ------------------------------------------------------------
    -- ARTICLES.Visibility
    ------------------------------------------------------------
    IF COL_LENGTH('dbo.ARTICLES', 'Visibility') IS NULL
    BEGIN
        ALTER TABLE dbo.ARTICLES
        ADD Visibility nvarchar(20) NOT NULL
            CONSTRAINT DF_ARTICLES_Visibility DEFAULT N'Public';
    END;

    IF OBJECT_ID(N'dbo.CK_ARTICLES_Visibility', N'C') IS NULL
    BEGIN
        ALTER TABLE dbo.ARTICLES
        ADD CONSTRAINT CK_ARTICLES_Visibility
        CHECK (Visibility IN (N'Public', N'Internal'));
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;