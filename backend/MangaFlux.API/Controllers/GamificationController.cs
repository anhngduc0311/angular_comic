using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Services;

namespace TruyenKomi.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GamificationController : ControllerBase
    {
        private readonly IGamificationService _gamificationService;

        public GamificationController(IGamificationService gamificationService)
        {
            _gamificationService = gamificationService;
        }

        private int GetUserId()
        {
            var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(idClaim, out var id) ? id : 0;
        }

        [HttpGet("profile")]
        [Authorize]
        public async Task<IActionResult> GetProfile()
        {
            var userId = GetUserId();
            var profile = await _gamificationService.GetProfileAsync(userId);
            if (profile == null) return NotFound(new { message = "Không tìm thấy người dùng." });
            return Ok(profile);
        }

        [HttpPost("check-in")]
        [Authorize]
        public async Task<IActionResult> CheckIn()
        {
            var userId = GetUserId();
            var result = await _gamificationService.CheckInDailyAsync(userId);
            return Ok(result);
        }

        [HttpPost("equip-frame")]
        [Authorize]
        public async Task<IActionResult> EquipFrame([FromBody] EquipFrameDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.FrameId))
            {
                return BadRequest(new { message = "Mã khung avatar không hợp lệ." });
            }

            var userId = GetUserId();
            var success = await _gamificationService.EquipFrameAsync(userId, dto.FrameId);
            if (!success)
            {
                return BadRequest(new { message = "Khung viền chưa được mở khóa hoặc không hợp lệ." });
            }

            return Ok(new { success = true, message = "Trang bị khung avatar thành công!" });
        }

        [HttpGet("leaderboard")]
        public async Task<IActionResult> GetLeaderboard([FromQuery] int limit = 20)
        {
            if (limit < 1) limit = 10;
            if (limit > 50) limit = 50;

            var leaderboard = await _gamificationService.GetLeaderboardAsync(limit);
            return Ok(leaderboard);
        }

        [HttpPost("read-chapter")]
        [Authorize]
        public async Task<IActionResult> AwardReadChapterExp([FromBody] AddHistoryDto dto)
        {
            var userId = GetUserId();
            var result = await _gamificationService.AddExpAsync(userId, 10, "Đọc chương truyện");
            return Ok(result);
        }
    }
}
