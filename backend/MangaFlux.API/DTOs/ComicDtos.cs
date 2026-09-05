using System;
using System.Collections.Generic;

namespace TruyenKomi.API.DTOs
{
    public class CategoryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? ImageUrl { get; set; }
        public int ComicCount { get; set; }
    }

    public class CategoryCreateUpdateDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Slug { get; set; }
        public string? Description { get; set; }
        public string? ImageUrl { get; set; }
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
        public string? OtherNames { get; set; }
        public string? Artist { get; set; }
        public string? Country { get; set; }
        public string? TranslatorGroup { get; set; }
        public string? AgeLimit { get; set; } = "13+";
        public int? ReleaseYear { get; set; }
        public string Status { get; set; } = "Ongoing";
        public int Views { get; set; }
        public decimal Rating { get; set; }
        public bool IsFeatured { get; set; }
        public bool IsPublic { get; set; } = true;
        public int TotalChapters { get; set; }
        public DateTime CreatedAt { get; set; }
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
        public string? Slug { get; set; }
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
        public string Status { get; set; } = "Ongoing";
        public bool IsFeatured { get; set; }
        public bool IsPublic { get; set; } = true;
        public List<int> CategoryIds { get; set; } = new();
    }

    public class ChapterDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public double ChapterNumber { get; set; }
        public string Title { get; set; } = string.Empty;
        public int Views { get; set; }
        public bool IsPublic { get; set; } = true;
        public DateTime? PublishedAt { get; set; }
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
        public bool IsPublic { get; set; } = true;
        public DateTime? PublishedAt { get; set; }
        public List<string> ImageUrls { get; set; } = new();
    }

    public class ChapterUpdateDto
    {
        public double ChapterNumber { get; set; }
        public string Title { get; set; } = string.Empty;
        public bool IsPublic { get; set; } = true;
        public DateTime? PublishedAt { get; set; }
        public List<string> ImageUrls { get; set; } = new();
    }

    public class CommentDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? UserAvatar { get; set; }
        public int ComicId { get; set; }
        public string? ComicTitle { get; set; }
        public string? ComicSlug { get; set; }
        public int? ChapterId { get; set; }
        public double? ChapterNumber { get; set; }
        public int? ParentCommentId { get; set; }
        public string Content { get; set; } = string.Empty;
        public bool IsHidden { get; set; }
        public int ReportCount { get; set; }
        public string? ReportReason { get; set; }
        public int LikesCount { get; set; }
        public bool IsLiked { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class ReportCommentDto
    {
        public string Reason { get; set; } = string.Empty;
    }

    public class CreateCommentDto
    {
        public int ComicId { get; set; }
        public int? ChapterId { get; set; }
        public int? ParentCommentId { get; set; }
        public string Content { get; set; } = string.Empty;
    }

    public class RecentChapterDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public string ComicTitle { get; set; } = string.Empty;
        public string ComicSlug { get; set; } = string.Empty;
        public string? ComicCoverImage { get; set; }
        public double ChapterNumber { get; set; }
        public string Title { get; set; } = string.Empty;
        public int Views { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class DailyViewStatDto
    {
        public string Date { get; set; } = string.Empty;
        public int Views { get; set; }
    }

    public class DashboardStatsDto
    {
        public int TotalComics { get; set; }
        public int TotalChapters { get; set; }
        public int TotalUsers { get; set; }
        public int TotalViews { get; set; }
        public List<ComicDto> TopViewedComics { get; set; } = new();
        public List<RecentChapterDto> RecentChapters { get; set; } = new();
        public List<DailyViewStatDto> ReadingStats { get; set; } = new();
    }
}

