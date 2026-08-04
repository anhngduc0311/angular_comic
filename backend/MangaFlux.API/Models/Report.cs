using System;

namespace MangaFlux.API.Models
{
    public class Report
    {
        public int Id { get; set; }

        public int ComicId { get; set; }
        public Comic? Comic { get; set; }

        public int? ChapterId { get; set; }
        public Chapter? Chapter { get; set; }

        public int? UserId { get; set; }
        public User? User { get; set; }

        public string ReporterName { get; set; } = string.Empty;
        
        // IMAGE_FAILED, WRONG_IMAGE_ORDER, DUPLICATE_CHAPTER, INAPPROPRIATE_CONTENT, BROKEN_LINK, OTHER
        public string ErrorType { get; set; } = string.Empty;

        public string? Description { get; set; }

        // Pending, Processing, Resolved, Dismissed
        public string Status { get; set; } = "Pending";

        public string? AdminNotes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ResolvedAt { get; set; }
    }
}
