using System;

namespace MangaFlux.API.DTOs
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
}
