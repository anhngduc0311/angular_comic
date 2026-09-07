-- ============================================================================
-- TRUYENKOMI DATABASE CREATION SCRIPT (POSTGRESQL)
-- ============================================================================

-- 1. Table: Users
CREATE TABLE IF NOT EXISTS "Users" (
    "Id" SERIAL PRIMARY KEY,
    "Username" VARCHAR(50) NOT NULL UNIQUE,
    "Email" VARCHAR(100) NOT NULL UNIQUE,
    "PasswordHash" VARCHAR(255) NOT NULL,
    "FullName" VARCHAR(100) NULL,
    "Avatar" VARCHAR(500) NULL,
    "Role" VARCHAR(20) NOT NULL DEFAULT 'User',
    "IsLocked" BOOLEAN NOT NULL DEFAULT FALSE,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "RefreshToken" TEXT NULL,
    "RefreshTokenExpiryTime" TIMESTAMP NULL,
    "GoogleId" VARCHAR(255) NULL,
    "AuthProvider" VARCHAR(50) NOT NULL DEFAULT 'Local'
);

-- 2. Table: Categories
CREATE TABLE IF NOT EXISTS "Categories" (
    "Id" SERIAL PRIMARY KEY,
    "Name" VARCHAR(100) NOT NULL UNIQUE,
    "Slug" VARCHAR(100) NOT NULL UNIQUE,
    "Description" VARCHAR(500) NULL,
    "ImageUrl" VARCHAR(500) NULL
);

-- 3. Table: Comics
CREATE TABLE IF NOT EXISTS "Comics" (
    "Id" SERIAL PRIMARY KEY,
    "Title" VARCHAR(255) NOT NULL,
    "Slug" VARCHAR(255) NOT NULL UNIQUE,
    "Description" TEXT NULL,
    "CoverImage" VARCHAR(500) NULL,
    "BannerImage" VARCHAR(500) NULL,
    "Author" VARCHAR(100) NULL,
    "OtherNames" VARCHAR(255) NULL,
    "Artist" VARCHAR(100) NULL,
    "Country" VARCHAR(50) NULL,
    "TranslatorGroup" VARCHAR(100) NULL,
    "AgeLimit" VARCHAR(20) NULL DEFAULT '13+',
    "ReleaseYear" INT NULL,
    "Status" VARCHAR(50) NOT NULL DEFAULT 'Ongoing',
    "Views" INT NOT NULL DEFAULT 0,
    "Rating" NUMERIC(3,2) NOT NULL DEFAULT 5.0,
    "IsFeatured" BOOLEAN NOT NULL DEFAULT FALSE,
    "IsPublic" BOOLEAN NOT NULL DEFAULT TRUE,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table: ComicCategories (Junction Table for Many-to-Many)
CREATE TABLE IF NOT EXISTS "ComicCategories" (
    "ComicId" INT NOT NULL,
    "CategoryId" INT NOT NULL,
    CONSTRAINT "PK_ComicCategories" PRIMARY KEY ("ComicId", "CategoryId"),
    CONSTRAINT "FK_ComicCategories_Comics" FOREIGN KEY ("ComicId") REFERENCES "Comics"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ComicCategories_Categories" FOREIGN KEY ("CategoryId") REFERENCES "Categories"("Id") ON DELETE CASCADE
);

-- 5. Table: Chapters
CREATE TABLE IF NOT EXISTS "Chapters" (
    "Id" SERIAL PRIMARY KEY,
    "ComicId" INT NOT NULL,
    "ChapterNumber" DOUBLE PRECISION NOT NULL,
    "Title" VARCHAR(255) NOT NULL,
    "Views" INT NOT NULL DEFAULT 0,
    "IsPublic" BOOLEAN NOT NULL DEFAULT TRUE,
    "PublishedAt" TIMESTAMP NULL,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Chapters_Comics" FOREIGN KEY ("ComicId") REFERENCES "Comics"("Id") ON DELETE CASCADE
);

-- 6. Table: ChapterPages
CREATE TABLE IF NOT EXISTS "ChapterPages" (
    "Id" SERIAL PRIMARY KEY,
    "ChapterId" INT NOT NULL,
    "PageNumber" INT NOT NULL,
    "ImageUrl" VARCHAR(500) NOT NULL,
    CONSTRAINT "FK_ChapterPages_Chapters" FOREIGN KEY ("ChapterId") REFERENCES "Chapters"("Id") ON DELETE CASCADE
);

-- 7. Table: Bookmarks
CREATE TABLE IF NOT EXISTS "Bookmarks" (
    "Id" SERIAL PRIMARY KEY,
    "UserId" INT NOT NULL,
    "ComicId" INT NOT NULL,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Bookmarks_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Bookmarks_Comics" FOREIGN KEY ("ComicId") REFERENCES "Comics"("Id") ON DELETE CASCADE,
    CONSTRAINT "UQ_User_Comic_Bookmark" UNIQUE ("UserId", "ComicId")
);

-- 8. Table: ReadingHistories
CREATE TABLE IF NOT EXISTS "ReadingHistories" (
    "Id" SERIAL PRIMARY KEY,
    "UserId" INT NOT NULL,
    "ComicId" INT NOT NULL,
    "ChapterId" INT NOT NULL,
    "LastReadAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_ReadingHistories_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ReadingHistories_Comics" FOREIGN KEY ("ComicId") REFERENCES "Comics"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ReadingHistories_Chapters" FOREIGN KEY ("ChapterId") REFERENCES "Chapters"("Id") ON DELETE CASCADE
);

-- 9. Table: Comments
CREATE TABLE IF NOT EXISTS "Comments" (
    "Id" SERIAL PRIMARY KEY,
    "UserId" INT NOT NULL,
    "ComicId" INT NOT NULL,
    "ChapterId" INT NULL,
    "ParentCommentId" INT NULL,
    "Content" TEXT NOT NULL,
    "IsHidden" BOOLEAN NOT NULL DEFAULT FALSE,
    "ReportCount" INT NOT NULL DEFAULT 0,
    "ReportReason" VARCHAR(500) NULL,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Comments_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Comments_Comics" FOREIGN KEY ("ComicId") REFERENCES "Comics"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Comments_Chapters" FOREIGN KEY ("ChapterId") REFERENCES "Chapters"("Id") ON DELETE SET NULL,
    CONSTRAINT "FK_Comments_ParentComment" FOREIGN KEY ("ParentCommentId") REFERENCES "Comments"("Id") ON DELETE SET NULL
);

-- 10. Table: CommentLikes
CREATE TABLE IF NOT EXISTS "CommentLikes" (
    "Id" SERIAL PRIMARY KEY,
    "UserId" INT NOT NULL,
    "CommentId" INT NOT NULL,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_CommentLikes_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_CommentLikes_Comments" FOREIGN KEY ("CommentId") REFERENCES "Comments"("Id") ON DELETE CASCADE,
    CONSTRAINT "UQ_User_CommentLike" UNIQUE ("UserId", "CommentId")
);

-- 11. Table: Notifications
CREATE TABLE IF NOT EXISTS "Notifications" (
    "Id" SERIAL PRIMARY KEY,
    "UserId" INT NOT NULL,
    "Type" VARCHAR(50) NOT NULL DEFAULT 'AdminSystem',
    "Title" VARCHAR(255) NOT NULL,
    "Message" TEXT NOT NULL,
    "Link" VARCHAR(500) NULL,
    "IsRead" BOOLEAN NOT NULL DEFAULT FALSE,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Notifications_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
);

-- 12. Table: Reports
CREATE TABLE IF NOT EXISTS "Reports" (
    "Id" SERIAL PRIMARY KEY,
    "ComicId" INT NOT NULL,
    "ChapterId" INT NULL,
    "UserId" INT NULL,
    "ReporterName" VARCHAR(100) NOT NULL,
    "ErrorType" VARCHAR(50) NOT NULL,
    "Description" TEXT NULL,
    "Status" VARCHAR(50) NOT NULL DEFAULT 'Pending',
    "AdminNotes" TEXT NULL,
    "CreatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ResolvedAt" TIMESTAMP NULL,
    CONSTRAINT "FK_Reports_Comics" FOREIGN KEY ("ComicId") REFERENCES "Comics"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Reports_Chapters" FOREIGN KEY ("ChapterId") REFERENCES "Chapters"("Id") ON DELETE SET NULL,
    CONSTRAINT "FK_Reports_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE SET NULL
);

-- Performance Optimization Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Comics_Slug" ON "Comics"("Slug");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Categories_Slug" ON "Categories"("Slug");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users"("Username");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users"("Email");
CREATE INDEX IF NOT EXISTS "IX_Chapters_ComicId" ON "Chapters"("ComicId");
CREATE INDEX IF NOT EXISTS "IX_Chapters_ComicId_ChapterNumber" ON "Chapters"("ComicId", "ChapterNumber");
CREATE INDEX IF NOT EXISTS "IX_ChapterPages_ChapterId" ON "ChapterPages"("ChapterId");
CREATE INDEX IF NOT EXISTS "IX_ReadingHistories_UserId_LastReadAt" ON "ReadingHistories"("UserId", "LastReadAt");
CREATE INDEX IF NOT EXISTS "IX_Bookmarks_UserId" ON "Bookmarks"("UserId");
CREATE INDEX IF NOT EXISTS "IX_Comments_ComicId_CreatedAt" ON "Comments"("ComicId", "CreatedAt");
CREATE INDEX IF NOT EXISTS "IX_Notifications_UserId_IsRead_CreatedAt" ON "Notifications"("UserId", "IsRead", "CreatedAt");
CREATE INDEX IF NOT EXISTS "IX_Comics_IsPublic_IsFeatured_UpdatedAt" ON "Comics"("IsPublic", "IsFeatured", "UpdatedAt");
