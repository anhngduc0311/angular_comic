using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MangaFlux.API.DTOs;
using MangaFlux.API.Services;

namespace MangaFlux.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;

        public ReportsController(IReportService reportService)
        {
            _reportService = reportService;
        }

        private int? GetUserIdOrNull()
        {
            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrEmpty(claim) && int.TryParse(claim, out var userId))
            {
                return userId;
            }
            return null;
        }

        // Public / Auth user submit report
        [HttpPost]
        public async Task<IActionResult> CreateReport([FromBody] CreateReportDto dto)
        {
            if (dto.ComicId <= 0)
                return BadRequest("ComicId không hợp lệ");

            if (string.IsNullOrWhiteSpace(dto.ErrorType))
                return BadRequest("Loại lỗi (ErrorType) không được để trống");

            try
            {
                var userId = GetUserIdOrNull();
                var result = await _reportService.CreateReportAsync(dto, userId);
                return Ok(result);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Lỗi server: {ex.Message}");
            }
        }

        // Admin: List all reports with filtering
        [HttpGet]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GetReports([FromQuery] string? status, [FromQuery] string? errorType, [FromQuery] string? search)
        {
            var reports = await _reportService.GetReportsAsync(status, errorType, search);
            return Ok(reports);
        }

        // Admin: Get stats
        [HttpGet("stats")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GetReportStats()
        {
            var stats = await _reportService.GetReportStatsAsync();
            return Ok(stats);
        }

        // Admin: Update status & notes
        [HttpPut("{id}/status")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> UpdateReportStatus(int id, [FromBody] UpdateReportStatusDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Status))
                return BadRequest("Trạng thái (Status) không được để trống");

            var updated = await _reportService.UpdateReportStatusAsync(id, dto);
            if (updated == null)
                return NotFound("Không tìm thấy báo lỗi");

            return Ok(updated);
        }

        // Admin: Delete report
        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeleteReport(int id)
        {
            var result = await _reportService.DeleteReportAsync(id);
            if (!result)
                return NotFound("Không tìm thấy báo lỗi để xóa");

            return Ok(new { success = true, message = "Xóa báo lỗi thành công" });
        }
    }
}
