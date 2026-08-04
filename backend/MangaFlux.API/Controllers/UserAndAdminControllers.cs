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
        private readonly INotificationService _notificationService;

        public UserController(IUserService userService, INotificationService notificationService)
        {
            _userService = userService;
            _notificationService = notificationService;
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

        [HttpGet("profile")]
        public async Task<IActionResult> GetProfile()
        {
            var profile = await _userService.GetUserProfileAsync(GetUserId());
            if (profile == null) return NotFound(new { message = "Không tìm thấy người dùng." });
            return Ok(profile);
        }

        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
        {
            var updated = await _userService.UpdateUserProfileAsync(GetUserId(), dto);
            if (updated == null) return BadRequest(new { message = "Cập nhật thất bại." });
            return Ok(updated);
        }

        [HttpPut("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            var (success, message) = await _userService.ChangePasswordAsync(GetUserId(), dto);
            if (!success) return BadRequest(new { message });
            return Ok(new { success = true, message });
        }

        [HttpPost("delete-account")]
        public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountDto dto)
        {
            var (success, message) = await _userService.DeleteAccountAsync(GetUserId(), dto);
            if (!success) return BadRequest(new { message });
            return Ok(new { success = true, message });
        }

        [HttpGet("comments")]
        public async Task<IActionResult> GetComments()
        {
            var comments = await _userService.GetUserCommentsAsync(GetUserId());
            return Ok(comments);
        }

        [HttpGet("notifications")]
        public async Task<IActionResult> GetNotifications()
        {
            var notifications = await _notificationService.GetUserNotificationsAsync(GetUserId());
            return Ok(notifications);
        }

        [HttpGet("notifications/unread-count")]
        public async Task<IActionResult> GetUnreadCount()
        {
            var count = await _notificationService.GetUnreadCountAsync(GetUserId());
            return Ok(new UnreadCountDto { UnreadCount = count });
        }

        [HttpPut("notifications/{id}/read")]
        public async Task<IActionResult> MarkAsRead(int id)
        {
            var result = await _notificationService.MarkAsReadAsync(GetUserId(), id);
            return Ok(new { success = result });
        }

        [HttpPut("notifications/read-all")]
        public async Task<IActionResult> MarkAllAsRead()
        {
            var result = await _notificationService.MarkAllAsReadAsync(GetUserId());
            return Ok(new { success = result });
        }
    }

    [Authorize(Roles = "Admin")]
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly IComicService _comicService;
        private readonly INotificationService _notificationService;

        public AdminController(IComicService comicService, INotificationService notificationService)
        {
            _comicService = comicService;
            _notificationService = notificationService;
        }

        [AllowAnonymous]
        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var stats = await _comicService.GetDashboardStatsAsync();
            return Ok(stats);
        }

        [AllowAnonymous]
        [HttpGet("comics/{id}")]
        public async Task<IActionResult> GetComicById(int id)
        {
            var comic = await _comicService.GetComicByIdAsync(id);
            if (comic == null) return NotFound(new { message = "Không tìm thấy truyện." });
            return Ok(comic);
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

        [AllowAnonymous]
        [HttpPut("comics/{id}/toggle-visibility")]
        public async Task<IActionResult> ToggleVisibility(int id)
        {
            var isPublic = await _comicService.ToggleComicVisibilityAsync(id);
            return Ok(new { success = true, isPublic });
        }

        [HttpDelete("comics/{id}")]
        public async Task<IActionResult> DeleteComic(int id)
        {
            var result = await _comicService.DeleteComicAsync(id);
            return Ok(new { success = result });
        }

        [AllowAnonymous]
        [HttpGet("comics/{comicId}/chapters")]
        public async Task<IActionResult> GetAdminChapters(int comicId)
        {
            var chapters = await _comicService.GetAdminChaptersByComicIdAsync(comicId);
            return Ok(chapters);
        }

        [HttpPost("chapters")]
        public async Task<IActionResult> AddChapter([FromBody] ChapterCreateDto dto)
        {
            var chapter = await _comicService.AddChapterAsync(dto);
            return Ok(chapter);
        }

        [HttpPut("chapters/{id}")]
        public async Task<IActionResult> UpdateChapter(int id, [FromBody] ChapterUpdateDto dto)
        {
            var updated = await _comicService.UpdateChapterAsync(id, dto);
            if (updated == null) return NotFound(new { message = "Không tìm thấy chương để cập nhật." });
            return Ok(updated);
        }

        [AllowAnonymous]
        [HttpPut("chapters/{id}/toggle-visibility")]
        public async Task<IActionResult> ToggleChapterVisibility(int id)
        {
            var isPublic = await _comicService.ToggleChapterVisibilityAsync(id);
            return Ok(new { success = true, isPublic });
        }

        [HttpDelete("chapters/{id}")]
        public async Task<IActionResult> DeleteChapter(int id)
        {
            var result = await _comicService.DeleteChapterAsync(id);
            return Ok(new { success = result });
        }

        [HttpPost("categories")]
        public async Task<IActionResult> CreateCategory([FromBody] CategoryCreateUpdateDto dto)
        {
            var category = await _comicService.CreateCategoryAsync(dto);
            return Ok(category);
        }

        [HttpPut("categories/{id}")]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] CategoryCreateUpdateDto dto)
        {
            var updated = await _comicService.UpdateCategoryAsync(id, dto);
            if (updated == null) return NotFound(new { message = "Không tìm thấy thể loại." });
            return Ok(updated);
        }

        [HttpDelete("categories/{id}")]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            var result = await _comicService.DeleteCategoryAsync(id);
            return Ok(new { success = result });
        }

        [HttpPost("notifications/broadcast")]
        public async Task<IActionResult> BroadcastNotification([FromBody] BroadcastNotificationDto dto)
        {
            await _notificationService.BroadcastNotificationAsync(dto);
            return Ok(new { success = true });
        }
    }
}
