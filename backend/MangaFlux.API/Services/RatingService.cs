using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;

namespace TruyenKomi.API.Services
{
    public interface IRatingService
    {
        Task<ComicRatingSummaryDto> SubmitRatingAsync(int userId, int comicId, int score, string? review);
        Task<ComicRatingSummaryDto> GetComicRatingSummaryAsync(int comicId, int? currentUserId);
        Task<PagedReviewsDto> GetComicReviewsAsync(int comicId, int page = 1, int pageSize = 10);
    }

    public class RatingService : IRatingService
    {
        private readonly MangaDbContext _context;
        private readonly IGamificationService _gamificationService;

        public RatingService(MangaDbContext context, IGamificationService gamificationService)
        {
            _context = context;
            _gamificationService = gamificationService;
        }

        public async Task<ComicRatingSummaryDto> SubmitRatingAsync(int userId, int comicId, int score, string? review)
        {
            if (score < 1) score = 1;
            if (score > 5) score = 5;

            var comic = await _context.Comics.FindAsync(comicId);
            if (comic == null)
            {
                throw new ArgumentException("Truyện không tồn tại.");
            }

            var existingRating = await _context.ComicRatings
                .FirstOrDefaultAsync(r => r.UserId == userId && r.ComicId == comicId);

            bool isNew = existingRating == null;

            if (isNew)
            {
                var newRating = new ComicRating
                {
                    UserId = userId,
                    ComicId = comicId,
                    Score = score,
                    Review = string.IsNullOrWhiteSpace(review) ? null : InputSanitizer.SanitizePlainText(review.Trim()),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _context.ComicRatings.Add(newRating);

                // Thưởng +10 EXP cho độc giả lần đầu đánh giá truyện
                await _gamificationService.AddExpAsync(userId, 10, "Đánh giá truyện");
            }
            else
            {
                existingRating!.Score = score;
                existingRating.Review = string.IsNullOrWhiteSpace(review) ? null : InputSanitizer.SanitizePlainText(review.Trim());
                existingRating.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            // Tính toán lại điểm trung bình và số lượt đánh giá
            var allRatings = await _context.ComicRatings
                .Where(r => r.ComicId == comicId)
                .Select(r => r.Score)
                .ToListAsync();

            if (allRatings.Any())
            {
                comic.Rating = Math.Round((decimal)allRatings.Average(), 1);
                comic.RatingCount = allRatings.Count;
            }
            else
            {
                comic.Rating = 5.0m;
                comic.RatingCount = 0;
            }

            await _context.SaveChangesAsync();

            return await GetComicRatingSummaryAsync(comicId, userId);
        }

        public async Task<ComicRatingSummaryDto> GetComicRatingSummaryAsync(int comicId, int? currentUserId)
        {
            var comic = await _context.Comics.AsNoTracking().FirstOrDefaultAsync(c => c.Id == comicId);
            if (comic == null)
            {
                return new ComicRatingSummaryDto { ComicId = comicId };
            }

            var ratings = await _context.ComicRatings
                .AsNoTracking()
                .Where(r => r.ComicId == comicId)
                .ToListAsync();

            var summary = new ComicRatingSummaryDto
            {
                ComicId = comicId,
                AverageScore = ratings.Any() ? Math.Round((decimal)ratings.Average(r => r.Score), 1) : comic.Rating,
                TotalRatings = ratings.Count,
                FiveStarCount = ratings.Count(r => r.Score == 5),
                FourStarCount = ratings.Count(r => r.Score == 4),
                ThreeStarCount = ratings.Count(r => r.Score == 3),
                TwoStarCount = ratings.Count(r => r.Score == 2),
                OneStarCount = ratings.Count(r => r.Score == 1)
            };

            if (currentUserId.HasValue)
            {
                var userRating = ratings.FirstOrDefault(r => r.UserId == currentUserId.Value);
                if (userRating != null)
                {
                    var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUserId.Value);
                    summary.CurrentUserReview = new ComicReviewDto
                    {
                        Id = userRating.Id,
                        UserId = userRating.UserId,
                        Username = user?.Username ?? "",
                        FullName = user?.FullName,
                        Avatar = user?.Avatar,
                        AvatarFrame = user?.AvatarFrame,
                        Realm = user != null ? _gamificationService.CalculateRealm(user.Exp) : null,
                        Score = userRating.Score,
                        Review = userRating.Review,
                        CreatedAt = userRating.CreatedAt,
                        UpdatedAt = userRating.UpdatedAt
                    };
                }
            }

            return summary;
        }

        public async Task<PagedReviewsDto> GetComicReviewsAsync(int comicId, int page = 1, int pageSize = 10)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 10;
            if (pageSize > 50) pageSize = 50;

            var query = _context.ComicRatings
                .AsNoTracking()
                .Where(r => r.ComicId == comicId && !string.IsNullOrEmpty(r.Review))
                .Include(r => r.User)
                .OrderByDescending(r => r.UpdatedAt);

            var totalCount = await query.CountAsync();
            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var reviewDtos = items.Select(r => new ComicReviewDto
            {
                Id = r.Id,
                UserId = r.UserId,
                Username = r.User.Username,
                FullName = r.User.FullName,
                Avatar = r.User.Avatar,
                AvatarFrame = string.IsNullOrEmpty(r.User.AvatarFrame) ? "avatar-frame-luyen-khi" : r.User.AvatarFrame,
                Realm = _gamificationService.CalculateRealm(r.User.Exp),
                Score = r.Score,
                Review = r.Review,
                CreatedAt = r.CreatedAt,
                UpdatedAt = r.UpdatedAt
            }).ToList();

            return new PagedReviewsDto
            {
                Items = reviewDtos,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling((double)totalCount / pageSize)
            };
        }
    }
}
