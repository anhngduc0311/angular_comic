using System.Collections.Generic;

namespace MangaFlux.API.Models
{
    public class Category
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? ImageUrl { get; set; }

        // Navigation Property
        public ICollection<ComicCategory> ComicCategories { get; set; } = new List<ComicCategory>();
    }
}
