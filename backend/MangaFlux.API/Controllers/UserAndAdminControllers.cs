using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MangaFlux.API.DTOs;
using MangaFlux.API.Services;

namespace MangaFlux.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly IUserService _userService;

        public UserController(IUserService userService)
        {
            _userService = userService;
        }

        private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        [HttpGet("bookmarks")]
        public async Task<IActionResult> GetBookmarks()
        {
            var bookmarks = await _userService.GetUserBookmarksAsync(GetUserId());
            return Ok(bookmarks);
        }

        [HttpPost("bookmarks")]
        public async Task<IActionResult> AddBookmark([FromBody] AddBookmarkDto dto)
        {
            var result = await _userService.AddBookmarkAsync(GetUserId(), dto.ComicId);
            return Ok(new { success = result });
        }

        [HttpDelete("bookmarks/{comicId}")]
        public async Task<IActionResult> RemoveBookmark(int comicId)
        {
            var result = await _userService.RemoveBookmarkAsync(GetUserId(), comicId);
            return Ok(new { success = result });
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetHistory()
        {
            var history = await _userService.GetUserHistoryAsync(GetUserId());
            return Ok(history);
        }

        [HttpPost("history")]
        public async Task<IActionResult> TrackHistory([FromBody] AddHistoryDto dto)
        {
            var result = await _userService.TrackReadingHistoryAsync(GetUserId(), dto.ComicId, dto.ChapterId);
            return Ok(new { success = result });
        }
    }

    [Authorize(Roles = "Admin")]
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly IComicService _comicService;

        public AdminController(IComicService comicService)
        {
            _comicService = comicService;
        }

        [HttpPost("comics")]
        public async Task<IActionResult> CreateComic([FromBody] ComicCreateUpdateDto dto)
        {
            var comic = await _comicService.CreateComicAsync(dto);
            return Ok(comic);
        }

        [HttpPut("comics/{id}")]
        public async Task<IActionResult> UpdateComic(int id, [FromBody] ComicCreateUpdateDto dto)
        {
            var comic = await _comicService.UpdateComicAsync(id, dto);
            if (comic == null) return NotFound();
            return Ok(comic);
        }

        [HttpDelete("comics/{id}")]
        public async Task<IActionResult> DeleteComic(int id)
        {
            var result = await _comicService.DeleteComicAsync(id);
            return Ok(new { success = result });
        }

        [HttpPost("chapters")]
        public async Task<IActionResult> AddChapter([FromBody] ChapterCreateDto dto)
        {
            var chapter = await _comicService.AddChapterAsync(dto);
            return Ok(chapter);
        }
    }
}
