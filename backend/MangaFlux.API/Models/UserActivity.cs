using System;

namespace MangaFlux.API.Models
{
    public class Bookmark
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;

        public int ComicId { get; set; }
        public Comic Comic { get; set; } = null!;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class ReadingHistory
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;

        public int ComicId { get; set; }
        public Comic Comic { get; set; } = null!;

        public int ChapterId { get; set; }
        public Chapter Chapter { get; set; } = null!;

        public DateTime LastReadAt { get; set; } = DateTime.UtcNow;
    }

    public class Comment
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;

        public int ComicId { get; set; }
        public Comic Comic { get; set; } = null!;

        public int? ChapterId { get; set; }
        public Chapter? Chapter { get; set; }

        public int? ParentCommentId { get; set; }
        public Comment? ParentComment { get; set; }

        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public System.Collections.Generic.ICollection<CommentLike> Likes { get; set; } = new System.Collections.Generic.List<CommentLike>();
    }
}
