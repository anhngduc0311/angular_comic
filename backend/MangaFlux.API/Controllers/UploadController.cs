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
    }
}
