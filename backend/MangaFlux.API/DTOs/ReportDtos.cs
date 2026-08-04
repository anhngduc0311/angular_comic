using System;

namespace MangaFlux.API.DTOs
{
    public class CreateReportDto
    {
        public int ComicId { get; set; }
        public int? ChapterId { get; set; }
        public string ErrorType { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? ReporterName { get; set; }
    }

    public class UpdateReportStatusDto
    {
        public string Status { get; set; } = string.Empty; // Pending, Processing, Resolved, Dismissed
        public string? AdminNotes { get; set; }
    }

    public class ReportResponseDto
    {
        public int Id { get; set; }
        public int ComicId { get; set; }
        public string ComicTitle { get; set; } = string.Empty;
        public string ComicSlug { get; set; } = string.Empty;
        
        public int? ChapterId { get; set; }
        public double? ChapterNumber { get; set; }
        public string? ChapterTitle { get; set; }

        public int? UserId { get; set; }
        public string? Username { get; set; }
        public string? UserAvatar { get; set; }

        public string ReporterName { get; set; } = string.Empty;
        public string ErrorType { get; set; } = string.Empty;
        public string ErrorTypeLabel { get; set; } = string.Empty;
        public string? Description { get; set; }
        
        public string Status { get; set; } = "Pending";
        public string StatusLabel { get; set; } = "Chờ xử lý";
        public string? AdminNotes { get; set; }
        
        public DateTime CreatedAt { get; set; }
        public DateTime? ResolvedAt { get; set; }
    }

    public class ReportStatsDto
    {
        public int Total { get; set; }
        public int Pending { get; set; }
        public int Processing { get; set; }
        public int Resolved { get; set; }
        public int Dismissed { get; set; }
    }
}
