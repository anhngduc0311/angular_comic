using System;
using System.Collections.Generic;

namespace TruyenKomi.API.DTOs
{
    public class SearchAutocompleteDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string? CoverImage { get; set; }
        public string? Author { get; set; }
        public string? LatestChapter { get; set; }
        public decimal Rating { get; set; }
        public int Views { get; set; }
        public string Status { get; set; } = "Ongoing";
        public List<string> Categories { get; set; } = new();
    }

    public class SearchFilterDto
    {
        public string? Query { get; set; }
        public List<string>? IncludeCategories { get; set; }
        public List<string>? ExcludeCategories { get; set; }
        public string? Status { get; set; } // "All", "Ongoing", "Completed"
        public string? Country { get; set; } // "All", "Japan", "Korea", "China", "Vietnam", "Western"
        public int? MinChapters { get; set; } // e.g. 0, 10, 50, 100, 300
        public int? Year { get; set; }
        public string? SortBy { get; set; } = "latest"; // "latest", "views", "rating", "az", "chapters"
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 24;
    }

    public class PagedSearchResultDto<T>
    {
        public List<T> Items { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)TotalCount / PageSize) : 0;
    }
}
