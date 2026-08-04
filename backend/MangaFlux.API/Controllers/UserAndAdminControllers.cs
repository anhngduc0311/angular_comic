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

        [HttpPost("notifications/broadcast")]
        public async Task<IActionResult> BroadcastNotification([FromBody] BroadcastNotificationDto dto)
        {
            await _notificationService.BroadcastNotificationAsync(dto);
            return Ok(new { success = true });
        }
    }
}
