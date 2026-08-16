IF COL_LENGTH('dbo.CATEGORIES', 'Visibility') IS NULL
BEGIN
    ALTER TABLE dbo.CATEGORIES ADD Visibility nvarchar(20) NOT NULL
        CONSTRAINT DF_CATEGORIES_Visibility DEFAULT ('Public');
    ALTER TABLE dbo.CATEGORIES ADD CONSTRAINT CK_CATEGORIES_Visibility
        CHECK (Visibility IN ('Public', 'Internal'));
END;

IF COL_LENGTH('dbo.ARTICLES', 'Visibility') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLES ADD Visibility nvarchar(20) NOT NULL
        CONSTRAINT DF_ARTICLES_Visibility DEFAULT ('Public');
    ALTER TABLE dbo.ARTICLES ADD CONSTRAINT CK_ARTICLES_Visibility
        CHECK (Visibility IN ('Public', 'Internal'));
END;
