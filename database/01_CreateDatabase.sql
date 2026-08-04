-- ============================================================================
-- MANGAFLUX DATABASE CREATION SCRIPT (SQL SERVER)
-- ============================================================================

IF DB_ID('MangaFluxDb') IS NOT NULL
BEGIN
    ALTER DATABASE MangaFluxDb SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MangaFluxDb;
END
GO

CREATE DATABASE MangaFluxDb;
GO

USE MangaFluxDb;
GO

-- 1. Table: Users
CREATE TABLE Users (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Username NVARCHAR(50) NOT NULL UNIQUE,
    Email NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FullName NVARCHAR(100) NULL,
    Avatar NVARCHAR(500) NULL,
    Role NVARCHAR(20) NOT NULL DEFAULT 'User', -- 'User' or 'Admin'
    IsLocked BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    RefreshToken NVARCHAR(MAX) NULL,
    RefreshTokenExpiryTime DATETIME2 NULL
);
GO

-- 2. Table: Categories
CREATE TABLE Categories (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Slug NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(500) NULL,
    ImageUrl NVARCHAR(500) NULL
);
GO

-- 3. Table: Comics
CREATE TABLE Comics (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Title NVARCHAR(255) NOT NULL,
    Slug NVARCHAR(255) NOT NULL UNIQUE,
    Description NVARCHAR(MAX) NULL,
    CoverImage NVARCHAR(500) NULL,
    BannerImage NVARCHAR(500) NULL,
    Author NVARCHAR(100) NULL,
    OtherNames NVARCHAR(255) NULL,
    Artist NVARCHAR(100) NULL,
    Country NVARCHAR(50) NULL,
    ReleaseYear INT NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Ongoing', -- 'Ongoing', 'Completed'
    Views INT NOT NULL DEFAULT 0,
    Rating DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    IsFeatured BIT NOT NULL DEFAULT 0,
    IsPublic BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);
GO

-- 4. Table: ComicCategories (Junction Table for Many-to-Many)
CREATE TABLE ComicCategories (
    ComicId INT NOT NULL,
    CategoryId INT NOT NULL,
    CONSTRAINT PK_ComicCategories PRIMARY KEY (ComicId, CategoryId),
    CONSTRAINT FK_ComicCategories_Comics FOREIGN KEY (ComicId) REFERENCES Comics(Id) ON DELETE CASCADE,
    CONSTRAINT FK_ComicCategories_Categories FOREIGN KEY (CategoryId) REFERENCES Categories(Id) ON DELETE CASCADE
);
GO

-- 5. Table: Chapters
CREATE TABLE Chapters (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ComicId INT NOT NULL,
    ChapterNumber FLOAT NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Views INT NOT NULL DEFAULT 0,
    IsPublic BIT NOT NULL DEFAULT 1,
    PublishedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Chapters_Comics FOREIGN KEY (ComicId) REFERENCES Comics(Id) ON DELETE CASCADE
);
GO

-- 6. Table: ChapterPages
CREATE TABLE ChapterPages (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ChapterId INT NOT NULL,
    PageNumber INT NOT NULL,
    ImageUrl NVARCHAR(500) NOT NULL,
    CONSTRAINT FK_ChapterPages_Chapters FOREIGN KEY (ChapterId) REFERENCES Chapters(Id) ON DELETE CASCADE
);
GO

-- 7. Table: Bookmarks
CREATE TABLE Bookmarks (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    ComicId INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Bookmarks_Users FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Bookmarks_Comics FOREIGN KEY (ComicId) REFERENCES Comics(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_User_Comic_Bookmark UNIQUE (UserId, ComicId)
);
GO

-- 8. Table: ReadingHistories
CREATE TABLE ReadingHistories (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    ComicId INT NOT NULL,
    ChapterId INT NOT NULL,
    LastReadAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ReadingHistories_Users FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT FK_ReadingHistories_Comics FOREIGN KEY (ComicId) REFERENCES Comics(Id) ON DELETE CASCADE,
    CONSTRAINT FK_ReadingHistories_Chapters FOREIGN KEY (ChapterId) REFERENCES Chapters(Id)
);
GO

-- 9. Table: Comments
CREATE TABLE Comments (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    ComicId INT NOT NULL,
    ChapterId INT NULL,
    ParentCommentId INT NULL,
    Content NVARCHAR(MAX) NOT NULL,
    IsHidden BIT NOT NULL DEFAULT 0,
    ReportCount INT NOT NULL DEFAULT 0,
    ReportReason NVARCHAR(500) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Comments_Users FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Comments_Comics FOREIGN KEY (ComicId) REFERENCES Comics(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Comments_Chapters FOREIGN KEY (ChapterId) REFERENCES Chapters(Id),
    CONSTRAINT FK_Comments_ParentComment FOREIGN KEY (ParentCommentId) REFERENCES Comments(Id)
);
GO

-- 10. Table: CommentLikes
CREATE TABLE CommentLikes (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    CommentId INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_CommentLikes_Users FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT FK_CommentLikes_Comments FOREIGN KEY (CommentId) REFERENCES Comments(Id),
    CONSTRAINT UQ_User_CommentLike UNIQUE (UserId, CommentId)
);
GO

-- 11. Table: Notifications
CREATE TABLE Notifications (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    Type NVARCHAR(50) NOT NULL DEFAULT 'AdminSystem',
    Title NVARCHAR(255) NOT NULL,
    Message NVARCHAR(MAX) NOT NULL,
    Link NVARCHAR(500) NULL,
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Notifications_Users FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
);
GO

-- 12. Table: Reports
CREATE TABLE Reports (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ComicId INT NOT NULL,
    ChapterId INT NULL,
    UserId INT NULL,
    ReporterName NVARCHAR(100) NOT NULL,
    ErrorType NVARCHAR(50) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
    AdminNotes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    ResolvedAt DATETIME2 NULL,
    CONSTRAINT FK_Reports_Comics FOREIGN KEY (ComicId) REFERENCES Comics(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Reports_Chapters FOREIGN KEY (ChapterId) REFERENCES Chapters(Id),
    CONSTRAINT FK_Reports_Users FOREIGN KEY (UserId) REFERENCES Users(Id)
);
GO

-- Performance Optimization Indexes
CREATE UNIQUE INDEX IX_Comics_Slug ON Comics(Slug);
CREATE UNIQUE INDEX IX_Categories_Slug ON Categories(Slug);
CREATE UNIQUE INDEX IX_Users_Username ON Users(Username);
CREATE UNIQUE INDEX IX_Users_Email ON Users(Email);
CREATE INDEX IX_Chapters_ComicId ON Chapters(ComicId);
CREATE INDEX IX_Chapters_ComicId_ChapterNumber ON Chapters(ComicId, ChapterNumber);
CREATE INDEX IX_ChapterPages_ChapterId ON ChapterPages(ChapterId);
CREATE INDEX IX_ReadingHistories_UserId_LastReadAt ON ReadingHistories(UserId, LastReadAt);
CREATE INDEX IX_Bookmarks_UserId ON Bookmarks(UserId);
CREATE INDEX IX_Comments_ComicId_CreatedAt ON Comments(ComicId, CreatedAt);
CREATE INDEX IX_Notifications_UserId_IsRead_CreatedAt ON Notifications(UserId, IsRead, CreatedAt);
CREATE INDEX IX_Comics_IsPublic_IsFeatured_UpdatedAt ON Comics(IsPublic, IsFeatured, UpdatedAt);
GO
