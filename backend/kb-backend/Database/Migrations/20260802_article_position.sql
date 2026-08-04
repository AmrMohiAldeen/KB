SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @PositionAdded bit = 0;

    IF COL_LENGTH('dbo.ARTICLES', 'Position') IS NULL
    BEGIN
        ALTER TABLE dbo.ARTICLES
        ADD Position int NOT NULL
            CONSTRAINT DF_ARTICLES_Position DEFAULT (0);

        SET @PositionAdded = 1;
    END;

    -- Populate positions only when the column was newly added.
    IF @PositionAdded = 1
    BEGIN
        EXEC sys.sp_executesql N'
            ;WITH RankedArticles AS
            (
                SELECT
                    ArticleID,
                    ROW_NUMBER() OVER
                    (
                        PARTITION BY CategoryID_FK
                        ORDER BY CreatedAt, ArticleID
                    ) - 1 AS CalculatedPosition
                FROM dbo.ARTICLES
            )
            UPDATE articles
            SET Position = ranked.CalculatedPosition
            FROM dbo.ARTICLES AS articles
            INNER JOIN RankedArticles AS ranked
                ON ranked.ArticleID = articles.ArticleID;
        ';
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_ARTICLES_CategoryID_Position'
          AND object_id = OBJECT_ID('dbo.ARTICLES')
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE INDEX IX_ARTICLES_CategoryID_Position
            ON dbo.ARTICLES (CategoryID_FK, Position, Title);
        ';
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;