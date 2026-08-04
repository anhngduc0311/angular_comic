using System;

namespace MangaFlux.API.Models
{
    public class Notification
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;

        // Types: "NewChapter", "CommentReply", "CommentLike", "AdminSystem"
        public string Type { get; set; } = "AdminSystem";
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? Link { get; set; }
        public bool IsRead { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class CommentLike
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;

        public int CommentId { get; set; }
        public Comment Comment { get; set; } = null!;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
