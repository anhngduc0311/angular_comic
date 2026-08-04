using System;

namespace MangaFlux.API.DTOs
{
    public class NotificationDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Type { get; set; } = "AdminSystem"; // "NewChapter", "CommentReply", "CommentLike", "AdminSystem"
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? Link { get; set; }
        public bool IsRead { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class BroadcastNotificationDto
    {
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? Link { get; set; }
    }

    public class UnreadCountDto
    {
        public int UnreadCount { get; set; }
    }
}
