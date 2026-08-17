using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using MangaFlux.API.Data;
using MangaFlux.API.DTOs;
using MangaFlux.API.Models;

namespace MangaFlux.API.Services
{
    public interface ISearchEngineService
    {
        Task<List<SearchAutocompleteDto>> QuickSearchAsync(string query, int limit = 6);
        Task<PagedSearchResultDto<ComicDto>> AdvancedSearchAsync(SearchFilterDto filter);
        Task SyncIndexAsync(int? comicId = null);
    }

    public class SearchEngineService : ISearchEngineService
    {
        private readonly MangaDbContext _context;
        private readonly ICacheService _cache;
        private readonly HttpClient _httpClient;
        private readonly string? _meiliHost;
        private readonly string? _meiliKey;

        public SearchEngineService(MangaDbContext context, ICacheService cache)
        {
            _context = context;
            _cache = cache;
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            _meiliHost = Environment.GetEnvironmentVariable("MEILISEARCH_HOST") ?? "http://localhost:7700";
            _meiliKey = Environment.GetEnvironmentVariable("MEILI_MASTER_KEY") ?? "MangaFluxMeiliMasterKey2026!";
        }

        public async Task<List<SearchAutocompleteDto>> QuickSearchAsync(string query, int limit = 6)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return new List<SearchAutocompleteDto>();
            }

            string cleanQuery = VietnameseTextNormalizer.RemoveDiacritics(query);
            string cacheKey = $"autocomplete_{cleanQuery}_{limit}";

            var cached = await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                var comics = await _context.Comics
                    .AsNoTracking()
                    .Where(c => c.IsPublic)
                    .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                    .Include(c => c.Chapters)
                    .Select(c => new
                    {
                        c.Id,
                        c.Title,
                        c.Slug,
                        c.CoverImage,
                        c.Author,
                        c.OtherNames,
                        c.Artist,
                        c.Views,
                        c.Rating,
                        c.Status,
                        Categories = c.ComicCategories.Select(cc => cc.Category.Name).ToList(),
                        LatestChapter = c.Chapters
                            .OrderByDescending(ch => ch.ChapterNumber)
                            .Select(ch => ch.Title)
                            .FirstOrDefault()
                    })
                    .ToListAsync();

                var scoredList = new List<(int score, SearchAutocompleteDto item)>();

                foreach (var c in comics)
                {
                    string normTitle = VietnameseTextNormalizer.RemoveDiacritics(c.Title);
                    string normAuthor = VietnameseTextNormalizer.RemoveDiacritics(c.Author);
                    string normOtherNames = VietnameseTextNormalizer.RemoveDiacritics(c.OtherNames);

                    int score = 0;

                    if (normTitle == cleanQuery) score += 1000;
                    else if (normTitle.StartsWith(cleanQuery)) score += 500;
                    else if (normTitle.Contains(cleanQuery)) score += 300;
                    else if (normOtherNames.Contains(cleanQuery)) score += 200;
                    else if (normAuthor.Contains(cleanQuery)) score += 150;
                    else if (VietnameseTextNormalizer.IsFuzzyMatch(normTitle, cleanQuery)) score += 100;

                    if (score > 0)
                    {
                        scoredList.Add((score, new SearchAutocompleteDto
                        {
                            Id = c.Id,
                            Title = c.Title,
                            Slug = c.Slug,
                            CoverImage = c.CoverImage,
                            Author = c.Author,
                            LatestChapter = c.LatestChapter,
                            Rating = c.Rating,
                            Views = c.Views,
                            Status = c.Status,
                            Categories = c.Categories
                        }));
                    }
                }

                return scoredList
                    .OrderByDescending(x => x.score)
                    .ThenByDescending(x => x.item.Views)
                    .Take(limit)
                    .Select(x => x.item)
                    .ToList();
            }, TimeSpan.FromMinutes(10));

            return cached ?? new List<SearchAutocompleteDto>();
        }

        public async Task<PagedSearchResultDto<ComicDto>> AdvancedSearchAsync(SearchFilterDto filter)
        {
            var query = _context.Comics
                .AsNoTracking()
                .Where(c => c.IsPublic)
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .AsQueryable();

            // 1. Status Filter
            if (!string.IsNullOrWhiteSpace(filter.Status) && filter.Status != "All")
            {
                query = query.Where(c => c.Status == filter.Status);
            }

            // 2. Country Filter
            if (!string.IsNullOrWhiteSpace(filter.Country) && filter.Country != "All")
            {
                query = query.Where(c => c.Country == filter.Country);
            }

            // 3. Min Chapters Filter
            if (filter.MinChapters.HasValue && filter.MinChapters.Value > 0)
            {
                query = query.Where(c => c.Chapters.Count >= filter.MinChapters.Value);
            }

            // 4. Include Categories
            if (filter.IncludeCategories != null && filter.IncludeCategories.Any())
            {
                foreach (var catSlug in filter.IncludeCategories)
                {
                    query = query.Where(c => c.ComicCategories.Any(cc => cc.Category.Slug == catSlug));
                }
            }

            // 5. Exclude Categories
            if (filter.ExcludeCategories != null && filter.ExcludeCategories.Any())
            {
                query = query.Where(c => !c.ComicCategories.Any(cc => filter.ExcludeCategories.Contains(cc.Category.Slug)));
            }

            var allComics = await query.ToListAsync();

            // 6. Text Search (Fuzzy & Accent Insensitive)
            if (!string.IsNullOrWhiteSpace(filter.Query))
            {
                string cleanQuery = VietnameseTextNormalizer.RemoveDiacritics(filter.Query);
                allComics = allComics
                    .Where(c =>
                    {
                        string title = VietnameseTextNormalizer.RemoveDiacritics(c.Title);
                        string author = VietnameseTextNormalizer.RemoveDiacritics(c.Author);
                        string otherNames = VietnameseTextNormalizer.RemoveDiacritics(c.OtherNames);
                        return title.Contains(cleanQuery) || 
                               author.Contains(cleanQuery) || 
                               otherNames.Contains(cleanQuery) ||
                               VietnameseTextNormalizer.IsFuzzyMatch(title, cleanQuery);
                    })
                    .ToList();
            }

            // 7. Sort By
            allComics = (filter.SortBy?.ToLowerInvariant()) switch
            {
                "views" => allComics.OrderByDescending(c => c.Views).ToList(),
                "rating" => allComics.OrderByDescending(c => c.Rating).ToList(),
                "az" => allComics.OrderBy(c => c.Title).ToList(),
                "chapters" => allComics.OrderByDescending(c => c.Chapters.Count).ToList(),
                _ => allComics.OrderByDescending(c => c.UpdatedAt).ToList()
            };

            int totalCount = allComics.Count;
            int page = filter.Page < 1 ? 1 : filter.Page;
            int pageSize = filter.PageSize < 1 ? 24 : filter.PageSize;

            var pagedComics = allComics
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(c => MapToComicDto(c))
                .ToList();

            return new PagedSearchResultDto<ComicDto>
            {
                Items = pagedComics,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize
            };
        }

        public async Task SyncIndexAsync(int? comicId = null)
        {
            await _cache.RemoveByPatternAsync("autocomplete_*");
            await _cache.RemoveByPatternAsync("search_*");
        }

        private static ComicDto MapToComicDto(Comic comic)
        {
            var latestChapter = comic.Chapters?
                .Where(ch => ch.IsPublic && (ch.PublishedAt == null || ch.PublishedAt <= DateTime.UtcNow))
                .OrderByDescending(ch => ch.ChapterNumber)
                .FirstOrDefault();

            return new ComicDto
            {
                Id = comic.Id,
                Title = comic.Title,
                Slug = comic.Slug,
                Description = comic.Description,
                CoverImage = comic.CoverImage,
                BannerImage = comic.BannerImage,
                Author = comic.Author,
                OtherNames = comic.OtherNames,
                Artist = comic.Artist,
                Country = comic.Country,
                ReleaseYear = comic.ReleaseYear,
                Status = comic.Status,
                Views = comic.Views,
                Rating = comic.Rating,
                IsFeatured = comic.IsFeatured,
                IsPublic = comic.IsPublic,
                UpdatedAt = comic.UpdatedAt,
                Categories = comic.ComicCategories?.Select(cc => new CategoryDto
                {
                    Id = cc.Category.Id,
                    Name = cc.Category.Name,
                    Slug = cc.Category.Slug,
                    Description = cc.Category.Description
                }).ToList() ?? new List<CategoryDto>(),
                LatestChapter = latestChapter != null ? new ChapterDto
                {
                    Id = latestChapter.Id,
                    ComicId = latestChapter.ComicId,
                    ChapterNumber = latestChapter.ChapterNumber,
                    Title = latestChapter.Title,
                    Views = latestChapter.Views,
                    IsPublic = latestChapter.IsPublic,
                    PublishedAt = latestChapter.PublishedAt,
                    CreatedAt = latestChapter.CreatedAt
                } : null
            };
        }
    }
}
