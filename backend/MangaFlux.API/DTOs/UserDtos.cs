using System;

namespace TruyenKomi.API.DTOs
{
    public class BookmarkDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public ComicDto Comic { get; set; } = null!;
        public DateTime CreatedAt { get; set; }
    }

    public class ReadingHistoryDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public ComicDto Comic { get; set; } = null!;
        public int ChapterId { get; set; }
        public ChapterDto Chapter { get; set; } = null!;
        public DateTime LastReadAt { get; set; }
    }

    public class AddBookmarkDto
    {
        public int ComicId { get; set; }
    }

    public class AddHistoryDto
    {
        public int ComicId { get; set; }
        public int ChapterId { get; set; }
    }

    public class UserProfileDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string? Avatar { get; set; }
        public string Role { get; set; } = "User";
        public bool IsLocked { get; set; }
        public DateTime CreatedAt { get; set; }
        public int FollowedCount { get; set; }
        public int CommentsCount { get; set; }
    }

    public class UserRoleUpdateDto
    {
        public string Role { get; set; } = "User";
    }

    public class UserCommentDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public string ComicTitle { get; set; } = string.Empty;
        public string ComicSlug { get; set; } = string.Empty;
        public string? ComicCover { get; set; }
        public int? ChapterId { get; set; }
        public double? ChapterNumber { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }

    public class UpdateProfileDto
    {
        public string? FullName { get; set; }
        public string? Avatar { get; set; }
        public string? Email { get; set; }
    }

    public class ChangePasswordDto
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    public class DeleteAccountDto
    {
        public string Password { get; set; } = string.Empty;
    }
}
