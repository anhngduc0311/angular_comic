using System;
using System.Collections.Generic;

namespace TruyenKomi.API.Models
{
    public class Comic
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? CoverImage { get; set; }
        public string? BannerImage { get; set; }
        public string? Author { get; set; }
        public string? OtherNames { get; set; }
        public string? Artist { get; set; }
        public string? Country { get; set; }
        public string? TranslatorGroup { get; set; }
        public string? AgeLimit { get; set; } = "13+";
        public int? ReleaseYear { get; set; }
        public string Status { get; set; } = "Ongoing"; // "Ongoing", "Completed"
        public int Views { get; set; } = 0;
        public decimal Rating { get; set; } = 5.0m;
        public bool IsFeatured { get; set; } = false;
        public bool IsPublic { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public ICollection<ComicCategory> ComicCategories { get; set; } = new List<ComicCategory>();
        public ICollection<Chapter> Chapters { get; set; } = new List<Chapter>();
        public ICollection<Bookmark> Bookmarks { get; set; } = new List<Bookmark>();
        public ICollection<ReadingHistory> ReadingHistories { get; set; } = new List<ReadingHistory>();
        public ICollection<Comment> Comments { get; set; } = new List<Comment>();
    }

    public class ComicCategory
    {
        public int ComicId { get; set; }
        public Comic Comic { get; set; } = null!;

        public int CategoryId { get; set; }
        public Category Category { get; set; } = null!;
    }
}
