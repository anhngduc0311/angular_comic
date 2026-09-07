using System;

namespace TruyenKomi.API.Models
{
    public class ComicRating
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public User User { get; set; } = null!;

        public int ComicId { get; set; }
        public Comic Comic { get; set; } = null!;

        public int Score { get; set; } // 1 to 5 stars
        public string? Review { get; set; } // Optional user review

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
