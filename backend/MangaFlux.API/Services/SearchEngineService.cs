using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;

namespace TruyenKomi.API.Services
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
            _meiliKey = Environment.GetEnvironmentVariable("MEILI_MASTER_KEY") ?? "TruyenKomiMeiliMasterKey2026!";
        }

        private async Task<HttpResponseMessage?> SendMeiliRequestAsync(HttpMethod method, string path, object? body = null)
        {
            try
            {
                var request = new HttpRequestMessage(method, $"{_meiliHost?.TrimEnd('/')}/{path.TrimStart('/')}");
                if (!string.IsNullOrEmpty(_meiliKey))
                {
                    request.Headers.Add("Authorization", $"Bearer {_meiliKey}");
                }
                if (body != null)
                {
                    var json = JsonSerializer.Serialize(body);
                    request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                }
                return await _httpClient.SendAsync(request);
            }
            catch
            {
                return null;
            }
        }

        public async Task<List<SearchAutocompleteDto>> QuickSearchAsync(string query, int limit = 6)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return new List<SearchAutocompleteDto>();
            }

            string cleanQuery = VietnameseTextNormalizer.RemoveDiacritics(query.Trim());
            string cacheKey = $"autocomplete_{cleanQuery}_{limit}";

            var cached = await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                // 1. Thử truy vấn Meilisearch container trước
                try
                {
                    var meiliPayload = new
                    {
                        q = query.Trim(),
                        limit = limit,
                        filter = "isPublic = true"
                    };

                    var meiliResponse = await SendMeiliRequestAsync(HttpMethod.Post, "/indexes/comics/search", meiliPayload);
                    if (meiliResponse != null && meiliResponse.IsSuccessStatusCode)
                    {
                        var content = await meiliResponse.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(content);
                        if (doc.RootElement.TryGetProperty("hits", out var hits) && hits.GetArrayLength() > 0)
                        {
                            var meiliResults = new List<SearchAutocompleteDto>();
                            foreach (var hit in hits.EnumerateArray())
                            {
                                meiliResults.Add(new SearchAutocompleteDto
                                {
                                    Id = hit.GetProperty("id").GetInt32(),
                                    Title = hit.GetProperty("title").GetString() ?? "",
                                    Slug = hit.GetProperty("slug").GetString() ?? "",
                                    CoverImage = hit.TryGetProperty("coverImage", out var cImg) ? cImg.GetString() : null,
                                    Author = hit.TryGetProperty("author", out var auth) ? auth.GetString() : null,
                                    LatestChapter = hit.TryGetProperty("latestChapter", out var latCh) ? latCh.GetString() : null,
                                    Rating = hit.TryGetProperty("rating", out var rat) ? rat.GetDecimal() : 5.0m,
                                    Views = hit.TryGetProperty("views", out var vw) ? vw.GetInt32() : 0,
                                    Status = hit.TryGetProperty("status", out var st) ? (st.GetString() ?? "Ongoing") : "Ongoing",
                                    Categories = hit.TryGetProperty("categories", out var cats)
                                        ? cats.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => !string.IsNullOrEmpty(x)).ToList()
                                        : new List<string>()
                                });
                            }
                            if (meiliResults.Count > 0)
                            {
                                return meiliResults;
                            }
                        }
                    }
                }
                catch
                {
                    // Fallback to SQL Server below
                }

                // 2. Fallback SQL Server tối ưu hóa (chỉ query top candidates thay vì kéo toàn bộ DB)
                string qText = query.Trim();
                var candidates = await _context.Comics
                    .AsNoTracking()
                    .Where(c => c.IsPublic && c.Chapters.Any(ch => (ch.ChapterNumber >= 0.8 && ch.ChapterNumber < 2.0) || (ch.ChapterNumber >= 0 && ch.ChapterNumber <= 1.5)) && (
                        c.Title.Contains(qText) || 
                        c.Slug.Contains(cleanQuery) || 
                        (c.Author != null && c.Author.Contains(qText)) || 
                        (c.OtherNames != null && c.OtherNames.Contains(qText))))
                    .OrderByDescending(c => c.Views)
                    .ThenByDescending(c => c.Id)
                    .Take(limit * 3)
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
                foreach (var c in candidates)
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

                    scoredList.Add((score > 0 ? score : 50, new SearchAutocompleteDto
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
                .Where(c => c.IsPublic && c.Chapters.Any(ch => (ch.ChapterNumber >= 0.8 && ch.ChapterNumber < 2.0) || (ch.ChapterNumber >= 0 && ch.ChapterNumber <= 1.5)));

            // 1. Status Filter
            if (!string.IsNullOrWhiteSpace(filter.Status) && filter.Status != "All")
            {
                query = query.Where(c => c.Status == filter.Status);
            }

            // 2. Country Filter
            if (!string.IsNullOrWhiteSpace(filter.Country) && filter.Country != "All")
            {
                string normCountry = filter.Country.Trim().ToLower();
                if (normCountry == "japan" || normCountry == "nhật bản" || normCountry == "manga" || normCountry == "nhat ban")
                {
                    // Any comic without Manhwa or Manhua tag and not Korea/China is considered Japanese (Manga)
                    query = query.Where(c => 
                        c.Country == "Nhật Bản" || 
                        c.Country == "Japan" || 
                        c.Country == "Manga" ||
                        (!c.ComicCategories.Any(cc => cc.Category.Slug == "manhwa" || cc.Category.Slug == "manhua" || cc.Category.Name.ToLower().Contains("manhwa") || cc.Category.Name.ToLower().Contains("manhua"))
                         && c.Country != "Hàn Quốc" && c.Country != "Korea" && c.Country != "Trung Quốc" && c.Country != "China" && c.Country != "Manhwa" && c.Country != "Manhua")
                    );
                }
                else if (normCountry == "korea" || normCountry == "hàn quốc" || normCountry == "manhwa" || normCountry == "han quoc")
                {
                    query = query.Where(c => 
                        c.Country == "Hàn Quốc" || 
                        c.Country == "Korea" || 
                        c.Country == "Manhwa" ||
                        c.ComicCategories.Any(cc => cc.Category.Slug == "manhwa" || cc.Category.Name.ToLower().Contains("manhwa"))
                    );
                }
                else if (normCountry == "china" || normCountry == "trung quốc" || normCountry == "manhua" || normCountry == "trung quoc")
                {
                    query = query.Where(c => 
                        c.Country == "Trung Quốc" || 
                        c.Country == "China" || 
                        c.Country == "Manhua" ||
                        c.ComicCategories.Any(cc => cc.Category.Slug == "manhua" || cc.Category.Name.ToLower().Contains("manhua"))
                    );
                }
                else if (normCountry == "western" || normCountry == "mỹ" || normCountry == "my" || normCountry == "comic" || normCountry == "us")
                {
                    query = query.Where(c => c.Country == "Mỹ" || c.Country == "Western" || c.Country == "Comic" || c.Country == "US");
                }
                else
                {
                    query = query.Where(c => c.Country != null && c.Country.ToLower() == normCountry);
                }
            }

            // 3. Min Chapters Filter
            if (filter.MinChapters.HasValue && filter.MinChapters.Value > 0)
            {
                query = query.Where(c => c.Chapters.Count(ch => ch.IsPublic) >= filter.MinChapters.Value);
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

            // 6. Text Search pushed to Database
            if (!string.IsNullOrWhiteSpace(filter.Query))
            {
                string cleanQuery = VietnameseTextNormalizer.RemoveDiacritics(filter.Query.Trim());
                string qText = filter.Query.Trim();
                query = query.Where(c => 
                    c.Title.Contains(qText) || 
                    c.Slug.Contains(cleanQuery) || 
                    (c.Author != null && c.Author.Contains(qText)) || 
                    (c.OtherNames != null && c.OtherNames.Contains(qText)));
            }

            // 7. Total Count directly in SQL Server
            int totalCount = await query.CountAsync();

            // 8. Sorting directly in SQL Server
            query = (filter.SortBy?.ToLowerInvariant()) switch
            {
                "views" => query.OrderByDescending(c => c.Views).ThenByDescending(c => c.Id),
                "rating" => query.OrderByDescending(c => c.Rating).ThenByDescending(c => c.Id),
                "az" or "title" => query.OrderBy(c => c.Title).ThenBy(c => c.Id),
                "chapters" => query.OrderByDescending(c => c.Chapters.Count).ThenByDescending(c => c.Id),
                _ => query.OrderByDescending(c => c.UpdatedAt).ThenByDescending(c => c.Id)
            };

            int page = filter.Page < 1 ? 1 : filter.Page;
            int pageSize = filter.PageSize < 1 ? 24 : (filter.PageSize > 100 ? 100 : filter.PageSize);

            // 9. Pagination Skip/Take directly in SQL Server with EF Core
            var comics = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .ToListAsync();

            var pagedComics = comics.Select(c => MapToComicDto(c)).ToList();

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

            try
            {
                // Cấu hình Settings cho index comics trên Meilisearch
                var settingsPayload = new
                {
                    searchableAttributes = new[] { "title", "otherNames", "author", "artist", "categories" },
                    filterableAttributes = new[] { "isPublic", "status", "country", "categories" },
                    sortableAttributes = new[] { "views", "rating", "updatedAt", "totalChapters" }
                };
                await SendMeiliRequestAsync(HttpMethod.Patch, "/indexes/comics/settings", settingsPayload);

                var query = _context.Comics
                    .AsNoTracking()
                    .Where(c => c.IsPublic && c.Chapters.Any(ch => (ch.ChapterNumber >= 0.8 && ch.ChapterNumber < 2.0) || (ch.ChapterNumber >= 0 && ch.ChapterNumber <= 1.5)))
                    .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                    .Include(c => c.Chapters)
                    .AsQueryable();

                if (comicId.HasValue)
                {
                    query = query.Where(c => c.Id == comicId.Value);
                }

                var comics = await query.ToListAsync();
                if (comics.Count > 0)
                {
                    var documents = comics.Select(c => new
                    {
                        id = c.Id,
                        title = c.Title,
                        slug = c.Slug,
                        coverImage = c.CoverImage,
                        author = c.Author,
                        otherNames = c.OtherNames,
                        artist = c.Artist,
                        country = c.Country,
                        status = c.Status,
                        views = c.Views,
                        rating = c.Rating,
                        isPublic = c.IsPublic,
                        updatedAt = c.UpdatedAt,
                        totalChapters = c.Chapters?.Count ?? 0,
                        categories = c.ComicCategories?.Select(cc => cc.Category.Name).ToList() ?? new List<string>(),
                        latestChapter = c.Chapters?.OrderByDescending(ch => ch.ChapterNumber).Select(ch => ch.Title).FirstOrDefault()
                    }).ToList();

                    await SendMeiliRequestAsync(HttpMethod.Post, "/indexes/comics/documents?primaryKey=id", documents);
                }
            }
            catch
            {
                // Bỏ qua lỗi kết nối Meilisearch nếu container chưa khởi động
            }
        }

        private static ComicDto MapToComicDto(Comic comic)
        {
            var orderedChapters = comic.Chapters?
                .Where(ch => ch.IsPublic && (ch.PublishedAt == null || ch.PublishedAt <= DateTime.UtcNow))
                .OrderByDescending(ch => ch.ChapterNumber)
                .ToList();

            var latestChapter = orderedChapters?.FirstOrDefault();
            var recentChapters = orderedChapters?
                .Take(3)
                .Select(ch => new ChapterDto
                {
                    Id = ch.Id,
                    ComicId = ch.ComicId,
                    ChapterNumber = ch.ChapterNumber,
                    Title = ch.Title,
                    Views = ch.Views,
                    IsPublic = ch.IsPublic,
                    PublishedAt = ch.PublishedAt,
                    CreatedAt = ch.CreatedAt
                }).ToList() ?? new List<ChapterDto>();

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
                Country = ComicService.ResolveComicCountry(comic),
                ReleaseYear = comic.ReleaseYear,
                Status = comic.Status,
                Views = comic.Views,
                Rating = comic.Rating,
                IsFeatured = comic.IsFeatured,
                IsPublic = comic.IsPublic,
                TotalChapters = comic.Chapters?.Count ?? 0,
                CommentsCount = comic.Comments?.Count ?? 0,
                LikesCount = comic.Bookmarks?.Count ?? 0,
                CreatedAt = comic.CreatedAt,
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
                } : null,
                RecentChapters = recentChapters
            };
        }
    }
}

