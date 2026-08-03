SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.ARTICLES', 'Position') IS NULL
BEGIN
    ALTER TABLE dbo.ARTICLES
        ADD Position int NOT NULL
            CONSTRAINT DF_ARTICLES_Position DEFAULT (0);

    ;WITH RankedArticles AS
    (
        SELECT ArticleID,
               ROW_NUMBER() OVER
               (
                   PARTITION BY CategoryID_FK
                   ORDER BY CreatedAt, ArticleID
               ) - 1 AS Position
        FROM dbo.ARTICLES
    )
    UPDATE articles
    SET Position = ranked.Position
    FROM dbo.ARTICLES AS articles
    INNER JOIN RankedArticles AS ranked ON ranked.ArticleID = articles.ArticleID;
END;

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ARTICLES_CategoryID_Position'
      AND object_id = OBJECT_ID('dbo.ARTICLES')
)
BEGIN
    CREATE INDEX IX_ARTICLES_CategoryID_Position
        ON dbo.ARTICLES (CategoryID_FK, Position, Title);
END;

COMMIT TRANSACTION;
