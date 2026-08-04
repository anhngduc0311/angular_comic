using System;
using System.Collections.Generic;

namespace MangaFlux.API.Models
{
    public class Chapter
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public Comic Comic { get; set; } = null!;

        public double ChapterNumber { get; set; }
        public string Title { get; set; } = string.Empty;
        public int Views { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        public ICollection<ChapterPage> Pages { get; set; } = new List<ChapterPage>();
    }

    public class ChapterPage
    {
        public int Id { get; set; }
        public int ChapterId { get; set; }
        public Chapter Chapter { get; set; } = null!;

        public int PageNumber { get; set; }
        public string ImageUrl { get; set; } = string.Empty;
    }
}
