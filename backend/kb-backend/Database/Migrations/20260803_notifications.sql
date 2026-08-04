SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.NOTIFICATIONS', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NOTIFICATIONS
    (
        NotificationID uniqueidentifier NOT NULL
            CONSTRAINT DF_NOTIFICATIONS_NotificationID DEFAULT newsequentialid(),
        ArticleID_FK uniqueidentifier NULL,
        UserID_FK uniqueidentifier NOT NULL,
        [Type] nvarchar(80) NOT NULL,
        Title nvarchar(250) NOT NULL,
        Body nvarchar(max) NOT NULL,
        IsRead bit NOT NULL CONSTRAINT DF_NOTIFICATIONS_IsRead DEFAULT (0),
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_NOTIFICATIONS_CreatedAt DEFAULT sysutcdatetime(),
        ReadAt datetime2(3) NULL,
        CONSTRAINT PK_NOTIFICATIONS PRIMARY KEY (NotificationID),
        CONSTRAINT FK_NOTIFICATIONS_ARTICLES FOREIGN KEY (ArticleID_FK)
            REFERENCES dbo.ARTICLES (ArticleID),
        CONSTRAINT FK_NOTIFICATIONS_USERS FOREIGN KEY (UserID_FK)
            REFERENCES dbo.USERS (UserID),
        CONSTRAINT CK_NOTIFICATIONS_ReadState CHECK
            ((IsRead = 0 AND ReadAt IS NULL) OR (IsRead = 1 AND ReadAt IS NOT NULL))
    );
END;
ELSE
BEGIN
    UPDATE dbo.NOTIFICATIONS SET Body = N'' WHERE Body IS NULL;
    UPDATE dbo.NOTIFICATIONS SET ReadAt = CreatedAt WHERE IsRead = 1 AND ReadAt IS NULL;
    UPDATE dbo.NOTIFICATIONS SET ReadAt = NULL WHERE IsRead = 0 AND ReadAt IS NOT NULL;
    ALTER TABLE dbo.NOTIFICATIONS ALTER COLUMN Body nvarchar(max) NOT NULL;

    IF OBJECT_ID(N'dbo.CK_NOTIFICATIONS_ReadState', N'C') IS NULL
        ALTER TABLE dbo.NOTIFICATIONS WITH CHECK ADD CONSTRAINT CK_NOTIFICATIONS_ReadState CHECK
            ((IsRead = 0 AND ReadAt IS NULL) OR (IsRead = 1 AND ReadAt IS NOT NULL));
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID(N'dbo.NOTIFICATIONS')
                 AND name = N'IX_NOTIFICATIONS_UserID_IsRead')
    CREATE INDEX IX_NOTIFICATIONS_UserID_IsRead
        ON dbo.NOTIFICATIONS (UserID_FK, IsRead, CreatedAt DESC);

COMMIT TRANSACTION;
