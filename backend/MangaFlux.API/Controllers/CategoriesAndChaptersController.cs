using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TruyenKomi.API.Services;

namespace TruyenKomi.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CategoriesController : ControllerBase
    {
        private readonly IComicService _comicService;

        public CategoriesController(IComicService comicService)
        {
            _comicService = comicService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var categories = await _comicService.GetAllCategoriesAsync();
            return Ok(categories);
        }
    }

    [ApiController]
    [EnableRateLimiting("chapter-limiter")]
    [Route("api/[controller]")]
    public class ChaptersController : ControllerBase
    {
        private readonly IComicService _comicService;

        public ChaptersController(IComicService comicService)
        {
            _comicService = comicService;
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var chapter = await _comicService.GetChapterByIdAsync(id);
            if (chapter == null) return NotFound(new { message = "Không tìm thấy chương này." });
            return Ok(chapter);
        }

        [HttpGet("by-slug/{comicSlug}/chuong-{chapterNumber}")]
        public async Task<IActionResult> GetBySlugAndNumber(string comicSlug, double chapterNumber)
        {
            var chapter = await _comicService.GetChapterBySlugAndNumberAsync(comicSlug, chapterNumber);
            if (chapter == null) return NotFound(new { message = "Không tìm thấy chương này." });
            return Ok(chapter);
        }
    }
}
