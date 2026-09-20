using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TruyenKomi.API.Services;

namespace TruyenKomi.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin")]
    public class UploadController : ControllerBase
    {
        private readonly IStorageService _storageService;

        public UploadController(IStorageService storageService)
        {
            _storageService = storageService;
        }

        [HttpPost("image")]
        public async Task<IActionResult> UploadImage(
            IFormFile file, 
            [FromQuery] string? folder = "covers",
            [FromQuery] string? comicSlug = null)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "Vui lòng chọn file ảnh để tải lên." });
            }

            var targetFolder = folder ?? "covers";
            string? prefix = null;
            if (!string.IsNullOrWhiteSpace(comicSlug))
            {
                var cleanSlug = CleanSlug(comicSlug);
                if (!string.IsNullOrEmpty(cleanSlug))
                {
                    targetFolder = $"{targetFolder.TrimEnd('/')}/{cleanSlug}";
                    prefix = "cover";
                }
            }

            var url = await _storageService.UploadFileAsync(file, targetFolder, prefix);
            return Ok(new { url });
        }

        [HttpPost("images")]
        public async Task<IActionResult> UploadImages(
            List<IFormFile> files, 
            [FromQuery] string? folder = "chapters",
            [FromQuery] string? comicSlug = null,
            [FromQuery] string? chapterNumber = null)
        {
            if (files == null || files.Count == 0)
            {
                return BadRequest(new { message = "Vui lòng chọn danh sách file ảnh." });
            }

            var targetFolder = folder ?? "chapters";
            if (!string.IsNullOrWhiteSpace(comicSlug))
            {
                var cleanSlug = CleanSlug(comicSlug);
                if (!string.IsNullOrEmpty(cleanSlug))
                {
                    targetFolder = $"{targetFolder.TrimEnd('/')}/{cleanSlug}";
                    if (!string.IsNullOrWhiteSpace(chapterNumber))
                    {
                        targetFolder = $"{targetFolder}/chap-{chapterNumber.Trim()}";
                    }
                }
            }

            var urls = await _storageService.UploadFilesAsync(files, targetFolder, "page");
            return Ok(new { urls });
        }

        [HttpGet("file/{**filePath}")]
        [HttpHead("file/{**filePath}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetFile(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return BadRequest(new { message = "Tham số file không hợp lệ." });
            }

            try
            {
                var (stream, contentType) = await _storageService.GetFileStreamAsync(filePath);
                Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
                return File(stream, contentType);
            }
            catch (Exception ex)
            {
                return NotFound(new { message = $"Không tìm thấy file '{filePath}': {ex.Message}" });
            }
        }

        private static string CleanSlug(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;
            var normalized = input.Trim().ToLowerInvariant();
            normalized = System.Text.RegularExpressions.Regex.Replace(normalized, @"[^a-z0-9\-]", "-");
            normalized = System.Text.RegularExpressions.Regex.Replace(normalized, @"-+", "-").Trim('-');
            return normalized;
        }
    }
}
