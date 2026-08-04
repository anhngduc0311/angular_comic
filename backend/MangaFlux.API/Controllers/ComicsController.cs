using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MangaFlux.API.DTOs;
using MangaFlux.API.Services;

namespace MangaFlux.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ComicsController : ControllerBase
    {
        private readonly IComicService _comicService;

        public ComicsController(IComicService comicService)
        {
            _comicService = comicService;
        }

        [HttpGet("featured")]
        public async Task<IActionResult> GetFeatured()
        {
            var comics = await _comicService.GetFeaturedComicsAsync();
            return Ok(comics);
        }

        [HttpGet("latest")]
        public async Task<IActionResult> GetLatest([FromQuery] int count = 12)
        {
            var comics = await _comicService.GetLatestComicsAsync(count);
            return Ok(comics);
        }

        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] string? category, [FromQuery] string? status, [FromQuery] string? sortBy)
        {
            var comics = await _comicService.SearchComicsAsync(q, category, status, sortBy);
            return Ok(comics);
        }

        [HttpGet("{slug}")]
        public async Task<IActionResult> GetBySlug(string slug)
        {
            var comic = await _comicService.GetComicBySlugAsync(slug);
            if (comic == null) return NotFound(new { message = "Không tìm thấy truyện." });
            return Ok(comic);
        }

        [HttpPost("import-scraped")]
        public async Task<IActionResult> ImportScraped([FromBody] ChapterCreateDto dto, [FromQuery] string comicTitle, [FromQuery] string comicSlug, [FromQuery] string coverImage)
        {
            var existingComic = await _comicService.GetComicBySlugAsync(comicSlug);
            int comicId;
            if (existingComic == null)
            {
                var created = await _comicService.CreateComicAsync(new ComicCreateUpdateDto
                {
                    Title = comicTitle,
                    Slug = comicSlug,
                    Description = $"Truyện {comicTitle} Tiếng Việt bản dịch Full mới nhất.",
                    CoverImage = coverImage,
                    BannerImage = coverImage,
                    Author = "Đang cập nhật",
                    Status = "Ongoing",
                    IsFeatured = true,
                    IsPublic = true
                });
                comicId = created.Id;
            }
            else
            {
                comicId = existingComic.Id;
            }

            dto.ComicId = comicId;
            var chapter = await _comicService.AddChapterAsync(dto);
            return Ok(new { comicId, comicSlug, chapterId = chapter.Id });
        }

        [Authorize]
        [EnableRateLimiting("comment-limiter")]
        [HttpPost("comments")]
        public async Task<IActionResult> AddComment([FromBody] CreateCommentDto dto)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userIdClaim == null || !int.TryParse(userIdClaim, out int userId))
            {
                return Unauthorized();
            }

            var comment = await _comicService.AddCommentAsync(userId, dto);
            return Ok(comment);
        }

        [Authorize]
        [EnableRateLimiting("comment-limiter")]
        [HttpPost("comments/{id}/like")]
        public async Task<IActionResult> LikeComment(int id)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userIdClaim == null || !int.TryParse(userIdClaim, out int userId))
            {
                return Unauthorized();
            }

            var result = await _comicService.LikeCommentAsync(userId, id);
            return Ok(new { success = result });
        }
    }
}
