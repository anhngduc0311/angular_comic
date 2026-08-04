using System;
using System.Collections.Generic;

namespace MangaFlux.API.DTOs
{
    public class CategoryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int ComicCount { get; set; }
    }

    public class ComicDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? CoverImage { get; set; }
        public string? BannerImage { get; set; }
        public string? Author { get; set; }
        public string Status { get; set; } = "Ongoing";
        public int Views { get; set; }
        public decimal Rating { get; set; }
        public bool IsFeatured { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<CategoryDto> Categories { get; set; } = new();
        public ChapterDto? LatestChapter { get; set; }
    }

    public class ComicDetailDto : ComicDto
    {
        public List<ChapterDto> Chapters { get; set; } = new();
        public List<CommentDto> Comments { get; set; } = new();
    }

    public class ComicCreateUpdateDto
    {
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? CoverImage { get; set; }
        public string? BannerImage { get; set; }
        public string? Author { get; set; }
        public string Status { get; set; } = "Ongoing";
        public bool IsFeatured { get; set; }
        public List<int> CategoryIds { get; set; } = new();
    }

    public class ChapterDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public double ChapterNumber { get; set; }
        public string Title { get; set; } = string.Empty;
        public int Views { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class ChapterDetailDto : ChapterDto
    {
        public string ComicTitle { get; set; } = string.Empty;
        public string ComicSlug { get; set; } = string.Empty;
        public List<ChapterPageDto> Pages { get; set; } = new();
        public List<ChapterDto> AllChapters { get; set; } = new();
    }

    public class ChapterPageDto
    {
        public int Id { get; set; }
        public int PageNumber { get; set; }
        public string ImageUrl { get; set; } = string.Empty;
    }

    public class ChapterCreateDto
    {
        public int ComicId { get; set; }
        public double ChapterNumber { get; set; }
        public string Title { get; set; } = string.Empty;
        public List<string> ImageUrls { get; set; } = new();
    }

    public class CommentDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? UserAvatar { get; set; }
        public int ComicId { get; set; }
        public int? ChapterId { get; set; }
        public int? ParentCommentId { get; set; }
        public string Content { get; set; } = string.Empty;
        public int LikesCount { get; set; }
        public bool IsLiked { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CreateCommentDto
    {
        public int ComicId { get; set; }
        public int? ChapterId { get; set; }
        public int? ParentCommentId { get; set; }
        public string Content { get; set; } = string.Empty;
    }
}
