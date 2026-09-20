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
        public async Task<IActionResult> UploadImage(IFormFile file, [FromQuery] string? folder = "covers")
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "Vui lòng chọn file ảnh để tải lên." });
            }

            var url = await _storageService.UploadFileAsync(file, folder);
            return Ok(new { url });
        }

        [HttpPost("images")]
        public async Task<IActionResult> UploadImages(List<IFormFile> files, [FromQuery] string? folder = "chapters")
        {
            if (files == null || files.Count == 0)
            {
                return BadRequest(new { message = "Vui lòng chọn danh sách file ảnh." });
            }

            var urls = await _storageService.UploadFilesAsync(files, folder);
            return Ok(new { urls });
        }

        [HttpGet("file/{folder}/{fileName}")]
        [HttpHead("file/{folder}/{fileName}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetFile(string folder, string fileName)
        {
            if (string.IsNullOrWhiteSpace(folder) || string.IsNullOrWhiteSpace(fileName))
            {
                return BadRequest(new { message = "Tham số file không hợp lệ." });
            }

            var key = $"{folder}/{fileName}";
            try
            {
                var (stream, contentType) = await _storageService.GetFileStreamAsync(key);
                Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
                return File(stream, contentType);
            }
            catch (Exception ex)
            {
                return NotFound(new { message = $"Không tìm thấy file '{key}': {ex.Message}" });
            }
        }
    }
}
