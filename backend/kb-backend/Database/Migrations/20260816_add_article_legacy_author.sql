IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorName') IS NULL
    ALTER TABLE dbo.ARTICLES ADD LegacyAuthorName nvarchar(300) NULL;

IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorEmail') IS NULL
    ALTER TABLE dbo.ARTICLES ADD LegacyAuthorEmail nvarchar(320) NULL;

IF COL_LENGTH('dbo.ARTICLES', 'LegacyAuthorExternalId') IS NULL
    ALTER TABLE dbo.ARTICLES ADD LegacyAuthorExternalId nvarchar(100) NULL;
