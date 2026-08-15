using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using MangaFlux.API.Data;
using MangaFlux.API.DTOs;
using MangaFlux.API.Models;

namespace MangaFlux.API.Services
{
    public interface IReportService
    {
        Task<ReportResponseDto> CreateReportAsync(CreateReportDto dto, int? userId = null);
        Task<List<ReportResponseDto>> GetReportsAsync(string? status = null, string? errorType = null, string? search = null);
        Task<ReportStatsDto> GetReportStatsAsync();
        Task<ReportResponseDto?> UpdateReportStatusAsync(int id, UpdateReportStatusDto dto);
        Task<bool> DeleteReportAsync(int id);
    }

    public class ReportService : IReportService
    {
        private readonly MangaDbContext _db;

        public ReportService(MangaDbContext db)
        {
            _db = db;
        }

        public static string MapErrorTypeLabel(string type) => type switch
        {
            "IMAGE_FAILED" => "Ảnh không tải được",
            "WRONG_IMAGE_ORDER" => "Sai thứ tự ảnh",
            "DUPLICATE_CHAPTER" => "Chapter bị trùng",
            "INAPPROPRIATE_CONTENT" => "Nội dung không phù hợp",
            "BROKEN_LINK" => "Link chapter bị lỗi",
            _ => "Lỗi khác"
        };

        public static string MapStatusLabel(string status) => status switch
        {
            "Pending" => "Chờ xử lý",
            "Processing" => "Đang xử lý",
            "Resolved" => "Đã xử lý",
            "Dismissed" => "Đã bỏ qua",
            _ => status
        };

        public async Task<ReportResponseDto> CreateReportAsync(CreateReportDto dto, int? userId = null)
        {
            var comic = await _db.Comics.FindAsync(dto.ComicId);
            if (comic == null)
                throw new ArgumentException("Comic không tồn tại");

            User? user = null;
            if (userId.HasValue)
            {
                user = await _db.Users.FindAsync(userId.Value);
            }

            var report = new Report
            {
                ComicId = dto.ComicId,
                ChapterId = dto.ChapterId,
                UserId = userId,
                ReporterName = !string.IsNullOrWhiteSpace(dto.ReporterName) 
                    ? dto.ReporterName 
                    : (user != null ? (user.FullName ?? user.Username) : "Độc giả ẩn danh"),
                ErrorType = dto.ErrorType,
                Description = dto.Description,
                Status = "Pending",
                CreatedAt = DateTime.UtcNow
            };

            _db.Reports.Add(report);
            await _db.SaveChangesAsync();

            return await GetReportDtoByIdAsync(report.Id);
        }

        public async Task<List<ReportResponseDto>> GetReportsAsync(string? status = null, string? errorType = null, string? search = null)
        {
            var query = _db.Reports
                .AsNoTracking()
                .Include(r => r.Comic)
                .Include(r => r.Chapter)
                .Include(r => r.User)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
            {
                query = query.Where(r => r.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(errorType) && errorType != "ALL")
            {
                query = query.Where(r => r.ErrorType == errorType);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.ToLower();
                query = query.Where(r => 
                    (r.Comic != null && r.Comic.Title.ToLower().Contains(s)) ||
                    (r.Chapter != null && r.Chapter.Title.ToLower().Contains(s)) ||
                    (r.Description != null && r.Description.ToLower().Contains(s)) ||
                    r.ReporterName.ToLower().Contains(s)
                );
            }

            var list = await query
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();

            return list.Select(r => MapToDto(r)).ToList();
        }

        public async Task<ReportStatsDto> GetReportStatsAsync()
        {
            var total = await _db.Reports.AsNoTracking().CountAsync();
            var pending = await _db.Reports.AsNoTracking().CountAsync(r => r.Status == "Pending");
            var processing = await _db.Reports.AsNoTracking().CountAsync(r => r.Status == "Processing");
            var resolved = await _db.Reports.AsNoTracking().CountAsync(r => r.Status == "Resolved");
            var dismissed = await _db.Reports.AsNoTracking().CountAsync(r => r.Status == "Dismissed");

            return new ReportStatsDto
            {
                Total = total,
                Pending = pending,
                Processing = processing,
                Resolved = resolved,
                Dismissed = dismissed
            };
        }

        public async Task<ReportResponseDto?> UpdateReportStatusAsync(int id, UpdateReportStatusDto dto)
        {
            var report = await _db.Reports.FindAsync(id);
            if (report == null) return null;

            report.Status = dto.Status;
            if (dto.AdminNotes != null)
            {
                report.AdminNotes = dto.AdminNotes;
            }

            if (dto.Status == "Resolved" || dto.Status == "Dismissed")
            {
                report.ResolvedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            return await GetReportDtoByIdAsync(id);
        }

        public async Task<bool> DeleteReportAsync(int id)
        {
            var report = await _db.Reports.FindAsync(id);
            if (report == null) return false;

            _db.Reports.Remove(report);
            await _db.SaveChangesAsync();
            return true;
        }

        private async Task<ReportResponseDto> GetReportDtoByIdAsync(int id)
        {
            var r = await _db.Reports
                .AsNoTracking()
                .Include(r => r.Comic)
                .Include(r => r.Chapter)
                .Include(r => r.User)
                .FirstAsync(r => r.Id == id);

            return MapToDto(r);
        }

        private static ReportResponseDto MapToDto(Report r)
        {
            return new ReportResponseDto
            {
                Id = r.Id,
                ComicId = r.ComicId,
                ComicTitle = r.Comic?.Title ?? "N/A",
                ComicSlug = r.Comic?.Slug ?? "",
                ChapterId = r.ChapterId,
                ChapterNumber = r.Chapter?.ChapterNumber,
                ChapterTitle = r.Chapter?.Title,
                UserId = r.UserId,
                Username = r.User?.Username,
                UserAvatar = r.User?.Avatar,
                ReporterName = r.ReporterName,
                ErrorType = r.ErrorType,
                ErrorTypeLabel = MapErrorTypeLabel(r.ErrorType),
                Description = r.Description,
                Status = r.Status,
                StatusLabel = MapStatusLabel(r.Status),
                AdminNotes = r.AdminNotes,
                CreatedAt = r.CreatedAt,
                ResolvedAt = r.ResolvedAt
            };
        }
    }
}
