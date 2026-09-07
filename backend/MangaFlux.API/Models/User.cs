using System;
using System.Collections.Generic;

namespace TruyenKomi.API.Models
{
    public class User
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string? Avatar { get; set; }
        public string Role { get; set; } = "User"; // "User" or "Admin"
        public bool IsLocked { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string? RefreshToken { get; set; }
        public DateTime? RefreshTokenExpiryTime { get; set; }

        public string? GoogleId { get; set; }
        public string AuthProvider { get; set; } = "Local";

        // Gamification & Cultivation System
        public int Exp { get; set; } = 0;
        public DateTime? LastAttendanceDate { get; set; }
        public int AttendanceStreak { get; set; } = 0;
        public string? AvatarFrame { get; set; } = "frame-default";
        public string? ActiveBadge { get; set; }

        // Navigation Properties
        public ICollection<Bookmark> Bookmarks { get; set; } = new List<Bookmark>();
        public ICollection<ReadingHistory> ReadingHistories { get; set; } = new List<ReadingHistory>();
        public ICollection<Comment> Comments { get; set; } = new List<Comment>();
        public ICollection<ComicRating> Ratings { get; set; } = new List<ComicRating>();
    }
}
