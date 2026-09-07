using System;
using System.Collections.Generic;

namespace TruyenKomi.API.DTOs
{
    public class SubmitRatingDto
    {
        public int Score { get; set; } // 1 to 5
        public string? Review { get; set; } // Max length 1000
    }

    public class ComicRatingSummaryDto
    {
        public int ComicId { get; set; }
        public decimal AverageScore { get; set; }
        public int TotalRatings { get; set; }
        public int FiveStarCount { get; set; }
        public int FourStarCount { get; set; }
        public int ThreeStarCount { get; set; }
        public int TwoStarCount { get; set; }
        public int OneStarCount { get; set; }
        public ComicReviewDto? CurrentUserReview { get; set; }
    }

    public class ComicReviewDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string? Avatar { get; set; }
        public string? AvatarFrame { get; set; }
        public RealmInfoDto? Realm { get; set; }
        public int Score { get; set; }
        public string? Review { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class PagedReviewsDto
    {
        public List<ComicReviewDto> Items { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
    }
}
