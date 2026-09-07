using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Services;

namespace TruyenKomi.API.Controllers
{
    [ApiController]
    [Route("api/comics/{comicId}")]
    public class RatingsController : ControllerBase
    {
        private readonly IRatingService _ratingService;

        public RatingsController(IRatingService ratingService)
        {
            _ratingService = ratingService;
        }

        private int? GetCurrentUserId()
        {
            var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(idClaim, out var id) ? id : null;
        }

        [HttpPost("ratings")]
        [Authorize]
        public async Task<IActionResult> SubmitRating(int comicId, [FromBody] SubmitRatingDto dto)
        {
            var userId = GetCurrentUserId();
            if (!userId.HasValue) return Unauthorized();

            if (dto.Score < 1 || dto.Score > 5)
            {
                return BadRequest(new { message = "Điểm đánh giá phải từ 1 đến 5 sao." });
            }

            try
            {
                var summary = await _ratingService.SubmitRatingAsync(userId.Value, comicId, dto.Score, dto.Review);
                return Ok(summary);
            }
            catch (System.ArgumentException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        [HttpGet("rating-summary")]
        public async Task<IActionResult> GetRatingSummary(int comicId)
        {
            var currentUserId = GetCurrentUserId();
            var summary = await _ratingService.GetComicRatingSummaryAsync(comicId, currentUserId);
            return Ok(summary);
        }

        [HttpGet("reviews")]
        public async Task<IActionResult> GetReviews(int comicId, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
        {
            var reviews = await _ratingService.GetComicReviewsAsync(comicId, page, pageSize);
            return Ok(reviews);
        }
    }
}
