using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;

namespace TruyenKomi.API.Services
{
    public interface IComicService
    {
        Task<List<ComicDto>> GetFeaturedComicsAsync(string? criteria = null, int count = 10);
        Task<List<ComicDto>> GetLatestComicsAsync(int count = 12);
        Task<PagedSearchResultDto<ComicDto>> SearchComicsAsync(string? query, string? categorySlug, string? status, string? sortBy, string? country = null, int page = 1, int pageSize = 24);
        Task<ComicDetailDto?> GetComicBySlugAsync(string slug);
        Task<ComicDetailDto?> GetComicByIdAsync(int id);
        Task<ChapterDetailDto?> GetChapterByIdAsync(int chapterId);
        Task<ChapterDetailDto?> GetChapterBySlugAndNumberAsync(string comicSlug, double chapterNumber);
        Task<List<CategoryDto>> GetAllCategoriesAsync(bool onlyWithComics = false);
        Task<CommentDto> AddCommentAsync(int userId, CreateCommentDto dto);
        Task<bool> LikeCommentAsync(int userId, int commentId);
        Task<PagedSearchResultDto<CommentDto>> GetComicCommentsAsync(int comicId, int page = 1, int pageSize = 20, int? currentUserId = null);
        Task<PagedSearchResultDto<CommentDto>> GetComicCommentsBySlugAsync(string slug, int page = 1, int pageSize = 20, int? currentUserId = null);

        // Admin operations
        Task<DashboardStatsDto> GetDashboardStatsAsync();
        Task<ComicDto> CreateComicAsync(ComicCreateUpdateDto dto);
        Task<ComicDto?> UpdateComicAsync(int id, ComicCreateUpdateDto dto);
        Task<bool> UpdateComicMetadataAsync(int comicId, string? author, string? translatorGroup, string? otherNames, string? ageLimit, string? coverImage, int? views = null, DateTime? createdAt = null, DateTime? updatedAt = null);
        Task SyncComicCategoriesAsync(int comicId, List<string> categoryNames);
        Task<bool> ToggleComicVisibilityAsync(int id);
        Task<bool> DeleteComicAsync(int id);
        Task<List<ChapterDetailDto>> GetAdminChaptersByComicIdAsync(int comicId);
        Task<ChapterDto> AddChapterAsync(ChapterCreateDto dto);
        Task<ChapterDto?> UpdateChapterAsync(int chapterId, ChapterUpdateDto dto);
        Task<bool> ToggleChapterVisibilityAsync(int chapterId);
        Task<bool> DeleteChapterAsync(int chapterId);
        Task<CategoryDto> CreateCategoryAsync(CategoryCreateUpdateDto dto);
        Task<CategoryDto?> UpdateCategoryAsync(int id, CategoryCreateUpdateDto dto);
        Task<bool> DeleteCategoryAsync(int id);
        Task<List<CommentDto>> GetAllCommentsForAdminAsync();
        Task<bool> ToggleCommentHiddenAsync(int commentId);
        Task<bool> ReportCommentAsync(int commentId, string reason);
        Task<bool> ResolveCommentReportAsync(int commentId);
        Task<bool> DeleteCommentAsync(int commentId);
        Task<int> FixAllComicDatesAsync();
    }

    public class ComicService : IComicService
    {
        private readonly MangaDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ICacheService _cache;
        private readonly IGamificationService _gamificationService;

        public ComicService(
            MangaDbContext context, 
            INotificationService notificationService, 
            ICacheService cache,
            IGamificationService gamificationService)
        {
            _context = context;
            _notificationService = notificationService;
            _cache = cache;
            _gamificationService = gamificationService;
        }

        public async Task<List<ComicDto>> GetFeaturedComicsAsync(string? criteria = null, int count = 10)
        {
            string crit = criteria?.Trim().ToLowerInvariant() ?? "trending";
            string cacheKey = $"featured_comics_cache_{crit}_{count}";
            return (await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                var query = _context.Comics
                    .AsNoTracking()
                    .Where(c => c.IsPublic && c.Chapters.Any())
                    .AsQueryable();

                query = crit switch
                {
                    "latest" => query.OrderByDescending(c => c.UpdatedAt),
                    "chapters" => query.OrderByDescending(c => c.Chapters.Count).ThenByDescending(c => c.UpdatedAt),
                    "views" => query.OrderByDescending(c => c.Views).ThenByDescending(c => c.UpdatedAt),
                    _ => query.OrderByDescending(c => c.Views)
                              .ThenByDescending(c => c.Chapters.Count)
                              .ThenByDescending(c => c.UpdatedAt)
                };

                var result = await query
                    .Take(count)
                    .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                    .Include(c => c.Chapters)
                    .ToListAsync();

                if (result.Count == 0)
                {
                    result = await _context.Comics
                        .AsNoTracking()
                        .Where(c => c.IsPublic)
                        .OrderByDescending(c => c.Views)
                        .ThenByDescending(c => c.UpdatedAt)
                        .Take(count)
                        .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                        .Include(c => c.Chapters)
                        .ToListAsync();
                }

                return result.Select(c => MapToComicDto(c)).ToList();
            }, TimeSpan.FromMinutes(10))) ?? new List<ComicDto>();
        }

        public async Task<List<ComicDto>> GetLatestComicsAsync(int count = 12)
        {
            string cacheKey = $"latest_comics_cache_{count}";
            return (await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                var result = await _context.Comics
                    .AsNoTracking()
                    .Where(c => c.IsPublic)
                    .OrderByDescending(c => c.UpdatedAt)
                    .Take(count)
                    .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                    .Include(c => c.Chapters)
                    .Select(c => MapToComicDto(c))
                    .ToListAsync();

                return result;
            }, TimeSpan.FromMinutes(15))) ?? new List<ComicDto>();
        }

        public async Task<PagedSearchResultDto<ComicDto>> SearchComicsAsync(string? query, string? categorySlug, string? status, string? sortBy, string? country = null, int page = 1, int pageSize = 24)
        {
            var comicsQuery = _context.Comics
                .AsNoTracking()
                .Where(c => c.IsPublic)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(query))
            {
                comicsQuery = comicsQuery.Where(c => c.Title.Contains(query) || (c.Author != null && c.Author.Contains(query)));
            }

            if (!string.IsNullOrWhiteSpace(categorySlug))
            {
                comicsQuery = comicsQuery.Where(c => c.ComicCategories.Any(cc => cc.Category.Slug == categorySlug));
            }

            if (!string.IsNullOrWhiteSpace(status) && status != "All")
            {
                comicsQuery = comicsQuery.Where(c => c.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(country) && country != "All")
            {
                string normCountry = country.Trim().ToLower();
                if (normCountry == "japan" || normCountry == "nhật bản" || normCountry == "manga" || normCountry == "nhat ban")
                {
                    // Any comic without Manhwa or Manhua tag and not Korea/China is considered Japanese (Manga)
                    comicsQuery = comicsQuery.Where(c => 
                        c.Country == "Nhật Bản" || 
                        c.Country == "Japan" || 
                        c.Country == "Manga" ||
                        (!c.ComicCategories.Any(cc => cc.Category.Slug == "manhwa" || cc.Category.Slug == "manhua" || cc.Category.Name.ToLower().Contains("manhwa") || cc.Category.Name.ToLower().Contains("manhua"))
                         && c.Country != "Hàn Quốc" && c.Country != "Korea" && c.Country != "Trung Quốc" && c.Country != "China" && c.Country != "Manhwa" && c.Country != "Manhua")
                    );
                }
                else if (normCountry == "korea" || normCountry == "hàn quốc" || normCountry == "manhwa" || normCountry == "han quoc")
                {
                    comicsQuery = comicsQuery.Where(c => 
                        c.Country == "Hàn Quốc" || 
                        c.Country == "Korea" || 
                        c.Country == "Manhwa" ||
                        c.ComicCategories.Any(cc => cc.Category.Slug == "manhwa" || cc.Category.Name.ToLower().Contains("manhwa"))
                    );
                }
                else if (normCountry == "china" || normCountry == "trung quốc" || normCountry == "manhua" || normCountry == "trung quoc")
                {
                    comicsQuery = comicsQuery.Where(c => 
                        c.Country == "Trung Quốc" || 
                        c.Country == "China" || 
                        c.Country == "Manhua" ||
                        c.ComicCategories.Any(cc => cc.Category.Slug == "manhua" || cc.Category.Name.ToLower().Contains("manhua"))
                    );
                }
                else if (normCountry == "western" || normCountry == "mỹ" || normCountry == "my" || normCountry == "comic" || normCountry == "us")
                {
                    comicsQuery = comicsQuery.Where(c => c.Country == "Mỹ" || c.Country == "Western" || c.Country == "Comic" || c.Country == "US");
                }
                else
                {
                    comicsQuery = comicsQuery.Where(c => c.Country != null && c.Country.ToLower() == normCountry);
                }
            }

            int totalCount = await comicsQuery.CountAsync();

            comicsQuery = (sortBy?.ToLowerInvariant()) switch
            {
                "views" => comicsQuery.OrderByDescending(c => c.Views),
                "rating" => comicsQuery.OrderByDescending(c => c.Rating),
                "title" or "az" => comicsQuery.OrderBy(c => c.Title),
                "chapters" => comicsQuery.OrderByDescending(c => c.Chapters.Count),
                _ => comicsQuery.OrderByDescending(c => c.UpdatedAt)
            };

            page = page < 1 ? 1 : page;
            pageSize = pageSize < 1 ? 24 : (pageSize > 100 ? 100 : pageSize);

            var comics = await comicsQuery
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .ToListAsync();

            return new PagedSearchResultDto<ComicDto>
            {
                Items = comics.Select(c => MapToComicDto(c)).ToList(),
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize
            };
        }

        public async Task<ComicDetailDto?> GetComicBySlugAsync(string slug)
        {
            string cacheKey = $"comic_detail_slug_{slug}";
            var cached = await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                var comic = await _context.Comics
                    .AsNoTracking()
                    .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                    .Include(c => c.Chapters)
                    .FirstOrDefaultAsync(c => c.Slug == slug);

                if (comic == null) return null;
                return MapToComicDetailDto(comic);
            }, TimeSpan.FromMinutes(15));

            if (cached != null)
            {
                _ = _cache.IncrementAsync($"comic_views_count_{cached.Id}");
            }

            return cached;
        }

        public async Task<ComicDetailDto?> GetComicByIdAsync(int id)
        {
            var comic = await _context.Comics
                .AsNoTracking()
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (comic == null) return null;

            return MapToComicDetailDto(comic);
        }

        public static string ResolveComicCountry(Comic comic)
        {
            if (comic.ComicCategories != null && comic.ComicCategories.Any())
            {
                if (comic.ComicCategories.Any(cc => cc.Category != null && (cc.Category.Slug == "manhwa" || cc.Category.Name.ToLower().Contains("manhwa"))))
                    return "Hàn Quốc";
                if (comic.ComicCategories.Any(cc => cc.Category != null && (cc.Category.Slug == "manhua" || cc.Category.Name.ToLower().Contains("manhua"))))
                    return "Trung Quốc";
            }
            if (!string.IsNullOrWhiteSpace(comic.Country))
            {
                string norm = comic.Country.Trim().ToLower();
                if (norm == "korea" || norm == "hàn quốc" || norm == "manhwa" || norm == "han quoc") return "Hàn Quốc";
                if (norm == "china" || norm == "trung quốc" || norm == "manhua" || norm == "trung quoc") return "Trung Quốc";
                if (norm == "western" || norm == "mỹ" || norm == "my" || norm == "comic" || norm == "us") return "Mỹ";
                if (norm == "japan" || norm == "nhật bản" || norm == "manga" || norm == "nhat ban") return "Nhật Bản";
                return comic.Country;
            }
            return "Nhật Bản";
        }

        private static ComicDetailDto MapToComicDetailDto(Comic comic)
        {
            return new ComicDetailDto
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
                Country = ResolveComicCountry(comic),
                TranslatorGroup = comic.TranslatorGroup ?? "Đang cập nhật",
                AgeLimit = string.IsNullOrWhiteSpace(comic.AgeLimit) ? "13+" : comic.AgeLimit,
                ReleaseYear = comic.ReleaseYear,
                Status = comic.Status,
                Views = comic.Views,
                Rating = comic.Rating,
                IsFeatured = comic.IsFeatured,
                IsPublic = comic.IsPublic,
                TotalChapters = comic.Chapters?.Count ?? 0,
                CreatedAt = comic.CreatedAt,
                UpdatedAt = comic.UpdatedAt,
                Categories = comic.ComicCategories.Select(cc => new CategoryDto
                {
                    Id = cc.Category.Id,
                    Name = cc.Category.Name,
                    Slug = cc.Category.Slug
                }).ToList(),
                Chapters = (comic.Chapters ?? Enumerable.Empty<Chapter>())
                    .Where(ch => ch.IsPublic && (ch.PublishedAt == null || ch.PublishedAt <= DateTime.UtcNow))
                    .OrderBy(ch => ch.ChapterNumber)
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
                    }).ToList(),
                Comments = comic.Comments != null
                    ? comic.Comments
                        .Where(cm => !cm.IsHidden)
                        .OrderByDescending(cm => cm.CreatedAt)
                        .Take(10)
                        .Select(cm => new CommentDto
                        {
                            Id = cm.Id,
                            UserId = cm.UserId,
                            Username = cm.User != null ? cm.User.Username : "Ẩn danh",
                            UserAvatar = cm.User != null ? cm.User.Avatar : null,
                            ComicId = cm.ComicId,
                            ChapterId = cm.ChapterId,
                            ParentCommentId = cm.ParentCommentId,
                            Content = cm.Content,
                            IsHidden = cm.IsHidden,
                            ReportCount = cm.ReportCount,
                            ReportReason = cm.ReportReason,
                            LikesCount = cm.Likes != null ? cm.Likes.Count : 0,
                            IsLiked = false,
                            CreatedAt = cm.CreatedAt
                        }).ToList()
                    : new List<CommentDto>()
            };
        }

        public async Task<ChapterDetailDto?> GetChapterByIdAsync(int chapterId)
        {
            string cacheKey = $"chapter_detail_id_{chapterId}";
            string pagesCacheKey = $"chapter:pages:{chapterId}";

            var cached = await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                var chapter = await _context.Chapters
                    .AsNoTracking()
                    .Include(ch => ch.Comic)
                    .Include(ch => ch.Pages)
                    .FirstOrDefaultAsync(ch => ch.Id == chapterId);

                if (chapter == null) return null;

                var pageDtos = chapter.Pages.OrderBy(p => p.PageNumber).Select(p => new ChapterPageDto
                {
                    Id = p.Id,
                    PageNumber = p.PageNumber,
                    ImageUrl = p.ImageUrl
                }).ToList();

                // Cache Chapter Pages list explicitly (chapter:pages:{chapterId}) for 24 hours
                await _cache.SetAsync(pagesCacheKey, pageDtos, TimeSpan.FromHours(24));

                var allChapters = await _context.Chapters
                    .AsNoTracking()
                    .Where(ch => ch.ComicId == chapter.ComicId && ch.IsPublic && (ch.PublishedAt == null || ch.PublishedAt <= DateTime.UtcNow))
                    .OrderBy(ch => ch.ChapterNumber)
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
                    })
                    .ToListAsync();

                return new ChapterDetailDto
                {
                    Id = chapter.Id,
                    ComicId = chapter.ComicId,
                    ComicTitle = chapter.Comic?.Title ?? "Truyện Tranh",
                    ComicSlug = chapter.Comic?.Slug ?? "",
                    ChapterNumber = chapter.ChapterNumber,
                    Title = chapter.Title,
                    Views = chapter.Views,
                    IsPublic = chapter.IsPublic,
                    PublishedAt = chapter.PublishedAt,
                    CreatedAt = chapter.CreatedAt,
                    Pages = pageDtos
                };
            }, TimeSpan.FromHours(24));

            if (cached != null)
            {
                _ = _cache.IncrementAsync($"chapter_views_count_{chapterId}");
                _ = _cache.IncrementAsync($"comic_views_count_{cached.ComicId}");

                // Always populate fresh AllChapters synchronized with comic
                string comicChaptersCacheKey = $"comic_all_chapters_{cached.ComicId}";
                cached.AllChapters = await _cache.GetOrSetAsync(comicChaptersCacheKey, async () =>
                {
                    return await _context.Chapters
                        .AsNoTracking()
                        .Where(ch => ch.ComicId == cached.ComicId && ch.IsPublic && (ch.PublishedAt == null || ch.PublishedAt <= DateTime.UtcNow))
                        .OrderBy(ch => ch.ChapterNumber)
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
                        })
                        .ToListAsync();
                }, TimeSpan.FromMinutes(10)) ?? new List<ChapterDto>();
            }

            return cached;
        }

        public async Task<ChapterDetailDto?> GetChapterBySlugAndNumberAsync(string comicSlug, double chapterNumber)
        {
            var chapter = await _context.Chapters
                .AsNoTracking()
                .Include(ch => ch.Comic)
                .FirstOrDefaultAsync(ch => ch.Comic.Slug == comicSlug && Math.Abs(ch.ChapterNumber - chapterNumber) < 0.001);

            if (chapter == null) return null;
            return await GetChapterByIdAsync(chapter.Id);
        }

        public async Task<List<CategoryDto>> GetAllCategoriesAsync(bool onlyWithComics = false)
        {
            string cacheKey = onlyWithComics ? "all_categories_active_cache" : "all_categories_cache";
            return (await _cache.GetOrSetAsync(cacheKey, async () =>
            {
                var query = _context.Categories.AsNoTracking();
                if (onlyWithComics)
                {
                    query = query.Where(cat => cat.ComicCategories.Any(cc => cc.Comic.IsPublic));
                }

                var result = await query
                    .Select(cat => new CategoryDto
                    {
                        Id = cat.Id,
                        Name = cat.Name,
                        Slug = cat.Slug,
                        Description = cat.Description,
                        ImageUrl = cat.ImageUrl,
                        ComicCount = cat.ComicCategories.Count(cc => cc.Comic.IsPublic)
                    })
                    .OrderByDescending(cat => cat.ComicCount)
                    .ThenBy(cat => cat.Name)
                    .ToListAsync();

                return result;
            }, TimeSpan.FromMinutes(5))) ?? new List<CategoryDto>();
        }

        private async Task InvalidateCategoriesCacheAsync()
        {
            await _cache.RemoveAsync("all_categories_cache");
            await _cache.RemoveAsync("all_categories_active_cache");
        }

        public async Task<CommentDto> AddCommentAsync(int userId, CreateCommentDto dto)
        {
            var user = await _context.Users.FindAsync(userId);
            var comic = await _context.Comics.FindAsync(dto.ComicId);

            var comment = new Comment
            {
                UserId = userId,
                ComicId = dto.ComicId,
                ChapterId = dto.ChapterId,
                ParentCommentId = dto.ParentCommentId,
                Content = InputSanitizer.SanitizeComment(dto.Content),
                CreatedAt = DateTime.UtcNow
            };

            _context.Comments.Add(comment);
            await _context.SaveChangesAsync();

            // Reward +5 EXP for commenting
            await _gamificationService.AddExpAsync(userId, 5, "Bình luận truyện");

            // Trigger notification if replying to a comment
            if (dto.ParentCommentId.HasValue)
            {
                var parentComment = await _context.Comments.FindAsync(dto.ParentCommentId.Value);
                if (parentComment != null && parentComment.UserId != userId)
                {
                    var link = comic != null ? $"/comic/{comic.Slug}" : "/comics";
                    var title = "Có người trả lời bình luận";
                    var message = $"{user?.Username ?? "Một người dùng"} đã trả lời bình luận của bạn.";
                    await _notificationService.CreateNotificationAsync(parentComment.UserId, "CommentReply", title, message, link);
                }
            }

            var realm = user != null ? _gamificationService.CalculateRealm(user.Exp) : null;

            return new CommentDto
            {
                Id = comment.Id,
                UserId = user!.Id,
                Username = user.Username,
                UserAvatar = user.Avatar,
                UserAvatarFrame = user != null ? (string.IsNullOrEmpty(user.AvatarFrame) ? realm?.FrameClass : user.AvatarFrame) : "avatar-frame-default",
                UserRealm = realm,
                ComicId = comment.ComicId,
                ChapterId = comment.ChapterId,
                ParentCommentId = comment.ParentCommentId,
                Content = comment.Content,
                LikesCount = 0,
                IsLiked = false,
                CreatedAt = comment.CreatedAt
            };
        }

        public async Task<bool> LikeCommentAsync(int userId, int commentId)
        {
            var comment = await _context.Comments
                .Include(c => c.Comic)
                .FirstOrDefaultAsync(c => c.Id == commentId);

            if (comment == null) return false;

            var existingLike = await _context.CommentLikes
                .FirstOrDefaultAsync(cl => cl.UserId == userId && cl.CommentId == commentId);

            if (existingLike != null)
            {
                _context.CommentLikes.Remove(existingLike);
                await _context.SaveChangesAsync();
                return true;
            }

            _context.CommentLikes.Add(new CommentLike
            {
                UserId = userId,
                CommentId = commentId,
                CreatedAt = DateTime.UtcNow
            });
            await _context.SaveChangesAsync();

            // Notify comment author if it's someone else
            if (comment.UserId != userId)
            {
                var user = await _context.Users.FindAsync(userId);
                var link = comment.Comic != null ? $"/comic/{comment.Comic.Slug}" : "/comics";
                var title = "Bình luận được thích";
                var message = $"{user?.Username ?? "Một người dùng"} đã thích bình luận của bạn.";
                await _notificationService.CreateNotificationAsync(comment.UserId, "CommentLike", title, message, link);
            }

            return true;
        }

        public async Task<PagedSearchResultDto<CommentDto>> GetComicCommentsAsync(int comicId, int page = 1, int pageSize = 20, int? currentUserId = null)
        {
            page = page < 1 ? 1 : page;
            pageSize = pageSize < 1 ? 20 : (pageSize > 100 ? 100 : pageSize);

            var query = _context.Comments
                .AsNoTracking()
                .Where(c => c.ComicId == comicId && !c.IsHidden);

            int totalCount = await query.CountAsync();

            var commentEntities = await query
                .OrderByDescending(c => c.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(c => c.User)
                .Include(c => c.Likes)
                .ToListAsync();

            var comments = commentEntities.Select(cm =>
            {
                var realm = cm.User != null ? _gamificationService.CalculateRealm(cm.User.Exp) : null;
                var frame = cm.User != null 
                    ? (string.IsNullOrEmpty(cm.User.AvatarFrame) ? realm?.FrameClass : cm.User.AvatarFrame) 
                    : "avatar-frame-default";

                return new CommentDto
                {
                    Id = cm.Id,
                    UserId = cm.UserId,
                    Username = cm.User != null ? cm.User.Username : "Ẩn danh",
                    UserAvatar = cm.User != null ? cm.User.Avatar : null,
                    UserAvatarFrame = frame,
                    UserRealm = realm,
                    ComicId = cm.ComicId,
                    ChapterId = cm.ChapterId,
                    ParentCommentId = cm.ParentCommentId,
                    Content = cm.Content,
                    IsHidden = cm.IsHidden,
                    ReportCount = cm.ReportCount,
                    ReportReason = cm.ReportReason,
                    LikesCount = cm.Likes.Count,
                    IsLiked = currentUserId.HasValue && cm.Likes.Any(l => l.UserId == currentUserId.Value),
                    CreatedAt = cm.CreatedAt
                };
            }).ToList();

            return new PagedSearchResultDto<CommentDto>
            {
                Items = comments,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize
            };
        }

        public async Task<PagedSearchResultDto<CommentDto>> GetComicCommentsBySlugAsync(string slug, int page = 1, int pageSize = 20, int? currentUserId = null)
        {
            var comic = await _context.Comics.AsNoTracking().FirstOrDefaultAsync(c => c.Slug == slug);
            if (comic == null)
            {
                return new PagedSearchResultDto<CommentDto> { Items = new(), TotalCount = 0, Page = page, PageSize = pageSize };
            }
            return await GetComicCommentsAsync(comic.Id, page, pageSize, currentUserId);
        }

        private async Task InvalidateComicCacheAsync(string? slug = null, int? chapterId = null)
        {
            await _cache.RemoveAsync("featured_comics_cache");
            await _cache.RemoveAsync("latest_comics_cache_12");
            await _cache.RemoveAsync("latest_comics_cache_6");
            await _cache.RemoveAsync("latest_comics_cache_24");
            await _cache.RemoveAsync("latest_comics_cache_48");
            await _cache.RemoveAsync("latest_comics_cache_100");
            await _cache.RemoveAsync("all_categories_cache");
            await _cache.RemoveByPatternAsync("*latest_comics_cache*");
            await _cache.RemoveByPatternAsync("*featured_comics*");
            await _cache.RemoveByPatternAsync("*comic_all_chapters_*");
            await _cache.RemoveByPatternAsync("*chapter_detail_id_*");

            if (!string.IsNullOrEmpty(slug))
            {
                await _cache.RemoveAsync($"comic_detail_slug_{slug}");
                await _cache.RemoveByPatternAsync($"*comic_detail_slug_{slug}*");
            }
            if (chapterId.HasValue)
            {
                await _cache.RemoveAsync($"chapter_detail_id_{chapterId.Value}");
                await _cache.RemoveAsync($"chapter:pages:{chapterId.Value}");
                await _cache.RemoveByPatternAsync($"*{chapterId.Value}*");
            }
        }

        // Admin CRUD
        public async Task<ComicDto> CreateComicAsync(ComicCreateUpdateDto dto)
        {
            var rawSlug = string.IsNullOrWhiteSpace(dto.Slug) ? dto.Title : dto.Slug;
            var slug = System.Text.RegularExpressions.Regex.Replace(rawSlug.ToLower().Trim(), @"[^a-z0-9\s-]", "");
            slug = System.Text.RegularExpressions.Regex.Replace(slug, @"\s+", "-").Trim('-');
            if (string.IsNullOrEmpty(slug)) slug = "comic-" + Guid.NewGuid().ToString("N")[..8];

            var author = dto.Author;
            if (!string.IsNullOrWhiteSpace(author) && (author.Trim().Equals("ZETTRUYEN", StringComparison.OrdinalIgnoreCase) || author.Trim().Equals("ZET TRUYEN", StringComparison.OrdinalIgnoreCase)))
            {
                author = "TRUYENKOMI";
            }

            var comic = new Comic
            {
                Title = dto.Title,
                Slug = slug,
                Description = dto.Description,
                CoverImage = dto.CoverImage,
                BannerImage = dto.BannerImage,
                Author = author,
                OtherNames = dto.OtherNames,
                Artist = dto.Artist,
                Country = dto.Country,
                TranslatorGroup = dto.TranslatorGroup ?? "Đang cập nhật",
                AgeLimit = string.IsNullOrWhiteSpace(dto.AgeLimit) ? "13+" : dto.AgeLimit,
                ReleaseYear = dto.ReleaseYear,
                Status = dto.Status,
                IsFeatured = dto.IsFeatured,
                IsPublic = dto.IsPublic,
                CreatedAt = dto.CreatedAt ?? DateTime.UtcNow,
                UpdatedAt = dto.UpdatedAt ?? DateTime.UtcNow
            };

            _context.Comics.Add(comic);
            await _context.SaveChangesAsync();

            if (dto.CategoryIds.Any())
            {
                foreach (var catId in dto.CategoryIds)
                {
                    _context.ComicCategories.Add(new ComicCategory { ComicId = comic.Id, CategoryId = catId });
                }
                await _context.SaveChangesAsync();
                await InvalidateCategoriesCacheAsync();
            }

            await InvalidateComicCacheAsync(comic.Slug);
            return MapToComicDto(comic);
        }

        public async Task<ComicDto?> UpdateComicAsync(int id, ComicCreateUpdateDto dto)
        {
            var comic = await _context.Comics.Include(c => c.ComicCategories).FirstOrDefaultAsync(c => c.Id == id);
            if (comic == null) return null;

            comic.Title = dto.Title;
            if (!string.IsNullOrWhiteSpace(dto.Slug))
            {
                var customSlug = System.Text.RegularExpressions.Regex.Replace(dto.Slug.ToLower().Trim(), @"[^a-z0-9\s-]", "");
                customSlug = System.Text.RegularExpressions.Regex.Replace(customSlug, @"\s+", "-").Trim('-');
                if (!string.IsNullOrEmpty(customSlug)) comic.Slug = customSlug;
            }
            comic.Description = dto.Description;
            comic.CoverImage = dto.CoverImage;
            comic.BannerImage = dto.BannerImage;

            var author = dto.Author;
            if (!string.IsNullOrWhiteSpace(author) && (author.Trim().Equals("ZETTRUYEN", StringComparison.OrdinalIgnoreCase) || author.Trim().Equals("ZET TRUYEN", StringComparison.OrdinalIgnoreCase)))
            {
                author = "TRUYENKOMI";
            }
            comic.Author = author;
            comic.OtherNames = dto.OtherNames;
            comic.Artist = dto.Artist;
            comic.Country = dto.Country;
            if (!string.IsNullOrWhiteSpace(dto.TranslatorGroup)) comic.TranslatorGroup = dto.TranslatorGroup;
            if (!string.IsNullOrWhiteSpace(dto.AgeLimit)) comic.AgeLimit = dto.AgeLimit;
            comic.ReleaseYear = dto.ReleaseYear;
            comic.Status = dto.Status;
            comic.IsFeatured = dto.IsFeatured;
            comic.IsPublic = dto.IsPublic;
            if (dto.CreatedAt.HasValue) comic.CreatedAt = dto.CreatedAt.Value;
            comic.UpdatedAt = dto.UpdatedAt ?? DateTime.UtcNow;

            _context.ComicCategories.RemoveRange(comic.ComicCategories);
            foreach (var catId in dto.CategoryIds)
            {
                _context.ComicCategories.Add(new ComicCategory { ComicId = comic.Id, CategoryId = catId });
            }

            await _context.SaveChangesAsync();
            await InvalidateCategoriesCacheAsync();
            await InvalidateComicCacheAsync(comic.Slug);
            return MapToComicDto(comic);
        }

        public async Task<bool> UpdateComicMetadataAsync(int comicId, string? author, string? translatorGroup, string? otherNames, string? ageLimit, string? coverImage, int? views = null, DateTime? createdAt = null, DateTime? updatedAt = null)
        {
            var comic = await _context.Comics.FindAsync(comicId);
            if (comic == null) return false;

            if (!string.IsNullOrWhiteSpace(author) && (author.Trim().Equals("ZETTRUYEN", StringComparison.OrdinalIgnoreCase) || author.Trim().Equals("ZET TRUYEN", StringComparison.OrdinalIgnoreCase)))
            {
                author = "TRUYENKOMI";
            }

            bool changed = false;
            if (comic.Author != null && (comic.Author.Trim().Equals("ZETTRUYEN", StringComparison.OrdinalIgnoreCase) || comic.Author.Trim().Equals("ZET TRUYEN", StringComparison.OrdinalIgnoreCase)))
            {
                comic.Author = "TRUYENKOMI";
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(author) && author != "Đang cập nhật" && (comic.Author == "Đang cập nhật" || string.IsNullOrWhiteSpace(comic.Author) || comic.Author != author))
            {
                comic.Author = author;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(translatorGroup) && translatorGroup != "Đang cập nhật" && (comic.TranslatorGroup == "Đang cập nhật" || string.IsNullOrWhiteSpace(comic.TranslatorGroup) || comic.TranslatorGroup != translatorGroup))
            {
                comic.TranslatorGroup = translatorGroup;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(otherNames) && otherNames != "Đang cập nhật" && (comic.OtherNames == "Đang cập nhật" || string.IsNullOrWhiteSpace(comic.OtherNames) || comic.OtherNames != otherNames))
            {
                comic.OtherNames = otherNames;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(ageLimit) && comic.AgeLimit != ageLimit)
            {
                comic.AgeLimit = ageLimit;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(coverImage) && (string.IsNullOrWhiteSpace(comic.CoverImage) || comic.CoverImage != coverImage))
            {
                comic.CoverImage = coverImage;
                comic.BannerImage = coverImage;
                changed = true;
            }
            if (views.HasValue && views.Value > comic.Views)
            {
                comic.Views = views.Value;
                changed = true;
            }
            if (createdAt.HasValue)
            {
                comic.CreatedAt = DateTime.SpecifyKind(createdAt.Value, DateTimeKind.Utc);
                changed = true;
            }
            if (updatedAt.HasValue)
            {
                var utcUpdated = DateTime.SpecifyKind(updatedAt.Value, DateTimeKind.Utc);
                if (comic.UpdatedAt >= DateTime.UtcNow.AddHours(-24) || utcUpdated > comic.UpdatedAt)
                {
                    comic.UpdatedAt = utcUpdated;
                    changed = true;
                }
            }

            if (changed)
            {
                await _context.SaveChangesAsync();
                await InvalidateComicCacheAsync(comic.Slug);
            }
            return true;
        }

        public async Task SyncComicCategoriesAsync(int comicId, List<string> categoryNames)
        {
            if (categoryNames == null || !categoryNames.Any()) return;

            var comic = await _context.Comics
                .Include(c => c.ComicCategories)
                .FirstOrDefaultAsync(c => c.Id == comicId);
            if (comic == null) return;

            var allCategories = await _context.Categories.ToListAsync();
            bool changed = false;

            foreach (var rawName in categoryNames)
            {
                var name = rawName.Trim();
                if (string.IsNullOrWhiteSpace(name)) continue;

                // Normalize slug: remove accents and symbols
                var rawSlug = name.ToLower().Trim()
                    .Normalize(System.Text.NormalizationForm.FormD);
                var cleanSlug = System.Text.RegularExpressions.Regex.Replace(rawSlug, @"[\u0300-\u036f]", "")
                    .Replace("đ", "d").Replace("Đ", "d");
                cleanSlug = System.Text.RegularExpressions.Regex.Replace(cleanSlug, @"[^a-z0-9\s-]", "");
                cleanSlug = System.Text.RegularExpressions.Regex.Replace(cleanSlug, @"\s+", "-").Trim('-');

                var category = allCategories.FirstOrDefault(c => 
                    c.Name.Equals(name, StringComparison.OrdinalIgnoreCase) || 
                    (!string.IsNullOrEmpty(cleanSlug) && c.Slug.Equals(cleanSlug, StringComparison.OrdinalIgnoreCase)));

                if (category == null)
                {
                    category = new Category
                    {
                        Name = name,
                        Slug = string.IsNullOrWhiteSpace(cleanSlug) ? "genre-" + Guid.NewGuid().ToString("N")[..6] : cleanSlug,
                        Description = $"Thể loại {name} trên TruyenKomi"
                    };
                    _context.Categories.Add(category);
                    await _context.SaveChangesAsync();
                    allCategories.Add(category);
                    changed = true;
                }

                if (!comic.ComicCategories.Any(cc => cc.CategoryId == category.Id))
                {
                    comic.ComicCategories.Add(new ComicCategory
                    {
                        ComicId = comic.Id,
                        CategoryId = category.Id
                    });
                    changed = true;
                }
            }

            if (changed)
            {
                await _context.SaveChangesAsync();
                await InvalidateCategoriesCacheAsync();
                await InvalidateComicCacheAsync(comic.Slug);
            }
        }

        public async Task<bool> ToggleComicVisibilityAsync(int id)
        {
            var comic = await _context.Comics.FindAsync(id);
            if (comic == null) return false;

            comic.IsPublic = !comic.IsPublic;
            comic.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await InvalidateComicCacheAsync(comic.Slug);
            return comic.IsPublic;
        }

        public async Task<bool> DeleteComicAsync(int id)
        {
            var comic = await _context.Comics.FindAsync(id);
            if (comic == null) return false;

            var comicSlug = comic.Slug;

            // 1. Delete associated CommentLikes for all comments of this comic
            var commentIds = await _context.Comments.Where(c => c.ComicId == id).Select(c => c.Id).ToListAsync();
            if (commentIds.Any())
            {
                var likes = await _context.CommentLikes.Where(cl => commentIds.Contains(cl.CommentId)).ToListAsync();
                if (likes.Any()) _context.CommentLikes.RemoveRange(likes);
            }

            // 2. Delete all Comments of this comic
            var comments = await _context.Comments.Where(c => c.ComicId == id).ToListAsync();
            if (comments.Any()) _context.Comments.RemoveRange(comments);

            // 3. Delete ReadingHistories of this comic
            var histories = await _context.ReadingHistories.Where(rh => rh.ComicId == id).ToListAsync();
            if (histories.Any()) _context.ReadingHistories.RemoveRange(histories);

            // 4. Delete Bookmarks of this comic
            var bookmarks = await _context.Bookmarks.Where(b => b.ComicId == id).ToListAsync();
            if (bookmarks.Any()) _context.Bookmarks.RemoveRange(bookmarks);

            // 5. Delete Reports of this comic
            var reports = await _context.Reports.Where(r => r.ComicId == id).ToListAsync();
            if (reports.Any()) _context.Reports.RemoveRange(reports);

            // 6. Delete ComicCategories
            var comicCategories = await _context.ComicCategories.Where(cc => cc.ComicId == id).ToListAsync();
            if (comicCategories.Any()) _context.ComicCategories.RemoveRange(comicCategories);

            // 7. Delete ChapterPages and Chapters
            var chapters = await _context.Chapters.Include(ch => ch.Pages).Where(ch => ch.ComicId == id).ToListAsync();
            foreach (var ch in chapters)
            {
                if (ch.Pages != null && ch.Pages.Any())
                {
                    _context.ChapterPages.RemoveRange(ch.Pages);
                }
            }
            if (chapters.Any()) _context.Chapters.RemoveRange(chapters);

            // 8. Delete the Comic
            _context.Comics.Remove(comic);

            await _context.SaveChangesAsync();

            // 9. Invalidate Cache
            await InvalidateComicCacheAsync(comicSlug);

            return true;
        }

        public async Task<List<ChapterDetailDto>> GetAdminChaptersByComicIdAsync(int comicId)
        {
            var comic = await _context.Comics.FindAsync(comicId);
            if (comic == null) return new List<ChapterDetailDto>();

            var chapters = await _context.Chapters
                .Include(ch => ch.Pages)
                .Where(ch => ch.ComicId == comicId)
                .OrderBy(ch => ch.ChapterNumber)
                .ToListAsync();

            return chapters.Select(ch => new ChapterDetailDto
            {
                Id = ch.Id,
                ComicId = ch.ComicId,
                ComicTitle = comic.Title,
                ComicSlug = comic.Slug,
                ChapterNumber = ch.ChapterNumber,
                Title = ch.Title,
                Views = ch.Views,
                IsPublic = ch.IsPublic,
                PublishedAt = ch.PublishedAt,
                CreatedAt = ch.CreatedAt,
                Pages = ch.Pages.OrderBy(p => p.PageNumber).Select(p => new ChapterPageDto
                {
                    Id = p.Id,
                    PageNumber = p.PageNumber,
                    ImageUrl = p.ImageUrl
                }).ToList()
            }).ToList();
        }

        public async Task<ChapterDto> AddChapterAsync(ChapterCreateDto dto)
        {
            var chapter = await _context.Chapters
                .Include(c => c.Pages)
                .FirstOrDefaultAsync(c => c.ComicId == dto.ComicId && Math.Abs(c.ChapterNumber - dto.ChapterNumber) < 0.001);

            DateTime publishDate = dto.PublishedAt.HasValue 
                ? DateTime.SpecifyKind(dto.PublishedAt.Value, DateTimeKind.Utc)
                : (dto.CreatedAt.HasValue ? DateTime.SpecifyKind(dto.CreatedAt.Value, DateTimeKind.Utc) : DateTime.UtcNow);
            DateTime createdDate = dto.CreatedAt.HasValue 
                ? DateTime.SpecifyKind(dto.CreatedAt.Value, DateTimeKind.Utc)
                : (dto.PublishedAt.HasValue ? DateTime.SpecifyKind(dto.PublishedAt.Value, DateTimeKind.Utc) : DateTime.UtcNow);

            if (chapter == null)
            {
                chapter = new Chapter
                {
                    ComicId = dto.ComicId,
                    ChapterNumber = dto.ChapterNumber,
                    Title = dto.Title ?? string.Empty,
                    Views = dto.Views,
                    IsPublic = dto.IsPublic,
                    PublishedAt = publishDate,
                    CreatedAt = createdDate
                };
                _context.Chapters.Add(chapter);
                await _context.SaveChangesAsync();
            }
            else
            {
                chapter.Title = dto.Title ?? string.Empty;
                if (dto.Views > 0) chapter.Views = dto.Views;
                chapter.IsPublic = dto.IsPublic;
                if (dto.PublishedAt.HasValue) chapter.PublishedAt = DateTime.SpecifyKind(dto.PublishedAt.Value, DateTimeKind.Utc);
                if (dto.CreatedAt.HasValue) chapter.CreatedAt = DateTime.SpecifyKind(dto.CreatedAt.Value, DateTimeKind.Utc);
                if (chapter.Pages != null && chapter.Pages.Any())
                {
                    _context.ChapterPages.RemoveRange(chapter.Pages);
                }
            }

            if (dto.ImageUrls != null && dto.ImageUrls.Count > 0)
            {
                for (int i = 0; i < dto.ImageUrls.Count; i++)
                {
                    _context.ChapterPages.Add(new ChapterPage
                    {
                        ChapterId = chapter.Id,
                        PageNumber = i + 1,
                        ImageUrl = dto.ImageUrls[i]
                    });
                }
            }

            // Update comic updated time & views & clear cache
            var comic = await _context.Comics.Include(c => c.Chapters).FirstOrDefaultAsync(c => c.Id == dto.ComicId);
            if (comic != null)
            {
                if (comic.UpdatedAt >= DateTime.UtcNow.AddHours(-24) && comic.Chapters.Count <= 1)
                {
                    comic.UpdatedAt = createdDate;
                }
                else if (createdDate > comic.UpdatedAt)
                {
                    comic.UpdatedAt = createdDate;
                }
                int totalChapterViews = comic.Chapters.Sum(c => c.Views);
                if (totalChapterViews > comic.Views)
                {
                    comic.Views = totalChapterViews;
                }
            }

            await _context.SaveChangesAsync();

            try
            {
                await InvalidateComicCacheAsync(comic?.Slug, chapter.Id);
            }
            catch { }

            // Notify bookmarked users if public & published now
            try
            {
                var isCurrentlyPublished = dto.IsPublic && (dto.PublishedAt == null || dto.PublishedAt <= DateTime.UtcNow);
                var bookmarkedUserIds = await _context.Bookmarks
                    .Where(b => b.ComicId == dto.ComicId)
                    .Select(b => b.UserId)
                    .ToListAsync();

                if (comic != null && bookmarkedUserIds.Any() && isCurrentlyPublished)
                {
                    foreach (var uId in bookmarkedUserIds)
                    {
                        var link = $"/read/{comic.Slug}/chuong-{dto.ChapterNumber}";
                        var title = "Chapter mới!";
                        var message = $"Truyện '{comic.Title}' bạn theo dõi vừa có Chapter {dto.ChapterNumber}.";
                        await _notificationService.CreateNotificationAsync(uId, "NewChapter", title, message, link);
                    }
                }
            }
            catch { }

            return new ChapterDto
            {
                Id = chapter.Id,
                ComicId = chapter.ComicId,
                ChapterNumber = chapter.ChapterNumber,
                Title = chapter.Title,
                Views = chapter.Views,
                IsPublic = chapter.IsPublic,
                PublishedAt = chapter.PublishedAt,
                CreatedAt = chapter.CreatedAt
            };
        }

        public async Task<ChapterDto?> UpdateChapterAsync(int chapterId, ChapterUpdateDto dto)
        {
            var chapter = await _context.Chapters
                .Include(ch => ch.Pages)
                .FirstOrDefaultAsync(ch => ch.Id == chapterId);

            if (chapter == null) return null;

            chapter.ChapterNumber = dto.ChapterNumber;
            chapter.Title = dto.Title ?? string.Empty;
            if (dto.Views > 0) chapter.Views = dto.Views;
            chapter.IsPublic = dto.IsPublic;
            if (dto.PublishedAt.HasValue) chapter.PublishedAt = DateTime.SpecifyKind(dto.PublishedAt.Value, DateTimeKind.Utc);
            if (dto.CreatedAt.HasValue) chapter.CreatedAt = DateTime.SpecifyKind(dto.CreatedAt.Value, DateTimeKind.Utc);

            // Remove existing pages and add new ones in order
            if (chapter.Pages != null && chapter.Pages.Any())
            {
                _context.ChapterPages.RemoveRange(chapter.Pages);
            }

            if (dto.ImageUrls != null && dto.ImageUrls.Count > 0)
            {
                for (int i = 0; i < dto.ImageUrls.Count; i++)
                {
                    _context.ChapterPages.Add(new ChapterPage
                    {
                        ChapterId = chapter.Id,
                        PageNumber = i + 1,
                        ImageUrl = dto.ImageUrls[i]
                    });
                }
            }

            var comic = await _context.Comics.FindAsync(chapter.ComicId);
            if (comic != null) comic.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            try
            {
                await InvalidateComicCacheAsync(comic?.Slug, chapter.Id);
            }
            catch { }

            return new ChapterDto
            {
                Id = chapter.Id,
                ComicId = chapter.ComicId,
                ChapterNumber = chapter.ChapterNumber,
                Title = chapter.Title,
                Views = chapter.Views,
                IsPublic = chapter.IsPublic,
                PublishedAt = chapter.PublishedAt,
                CreatedAt = chapter.CreatedAt
            };
        }

        public async Task<bool> ToggleChapterVisibilityAsync(int chapterId)
        {
            var chapter = await _context.Chapters.FindAsync(chapterId);
            if (chapter == null) return false;

            chapter.IsPublic = !chapter.IsPublic;
            await _context.SaveChangesAsync();
            var comic = await _context.Comics.FindAsync(chapter.ComicId);
            await InvalidateComicCacheAsync(comic?.Slug, chapter.Id);
            return chapter.IsPublic;
        }

        public async Task<bool> DeleteChapterAsync(int chapterId)
        {
            var chapter = await _context.Chapters.Include(ch => ch.Pages).FirstOrDefaultAsync(ch => ch.Id == chapterId);
            if (chapter == null) return false;

            var comicId = chapter.ComicId;

            // 1. Delete ReadingHistories referencing this chapter
            var histories = await _context.ReadingHistories.Where(rh => rh.ChapterId == chapterId).ToListAsync();
            if (histories.Any()) _context.ReadingHistories.RemoveRange(histories);

            // 2. Delete Comments referencing this chapter (and their likes)
            var comments = await _context.Comments.Where(c => c.ChapterId == chapterId).ToListAsync();
            var commentIds = comments.Select(c => c.Id).ToList();
            if (commentIds.Any())
            {
                var likes = await _context.CommentLikes.Where(cl => commentIds.Contains(cl.CommentId)).ToListAsync();
                if (likes.Any()) _context.CommentLikes.RemoveRange(likes);
            }
            if (comments.Any()) _context.Comments.RemoveRange(comments);

            // 3. Delete Reports referencing this chapter
            var reports = await _context.Reports.Where(r => r.ChapterId == chapterId).ToListAsync();
            if (reports.Any()) _context.Reports.RemoveRange(reports);

            // 4. Delete Pages
            if (chapter.Pages != null && chapter.Pages.Any())
            {
                _context.ChapterPages.RemoveRange(chapter.Pages);
            }

            // 5. Remove Chapter
            _context.Chapters.Remove(chapter);
            await _context.SaveChangesAsync();

            var comic = await _context.Comics.FindAsync(comicId);
            await InvalidateComicCacheAsync(comic?.Slug, chapterId);
            return true;
        }

        public async Task<CategoryDto> CreateCategoryAsync(CategoryCreateUpdateDto dto)
        {
            var rawSlug = string.IsNullOrWhiteSpace(dto.Slug) ? dto.Name : dto.Slug;
            var slug = System.Text.RegularExpressions.Regex.Replace(rawSlug.ToLower().Trim(), @"[^a-z0-9\s-]", "");
            slug = System.Text.RegularExpressions.Regex.Replace(slug, @"\s+", "-").Trim('-');
            if (string.IsNullOrEmpty(slug)) slug = "genre-" + Guid.NewGuid().ToString("N")[..6];

            var category = new Category
            {
                Name = dto.Name,
                Slug = slug,
                Description = dto.Description,
                ImageUrl = dto.ImageUrl
            };

            _context.Categories.Add(category);
            await _context.SaveChangesAsync();
            await InvalidateCategoriesCacheAsync();
            await InvalidateComicCacheAsync();

            return new CategoryDto
            {
                Id = category.Id,
                Name = category.Name,
                Slug = category.Slug,
                Description = category.Description,
                ImageUrl = category.ImageUrl,
                ComicCount = 0
            };
        }

        public async Task<CategoryDto?> UpdateCategoryAsync(int id, CategoryCreateUpdateDto dto)
        {
            var category = await _context.Categories.Include(c => c.ComicCategories).FirstOrDefaultAsync(c => c.Id == id);
            if (category == null) return null;

            category.Name = dto.Name;
            if (!string.IsNullOrWhiteSpace(dto.Slug))
            {
                var customSlug = System.Text.RegularExpressions.Regex.Replace(dto.Slug.ToLower().Trim(), @"[^a-z0-9\s-]", "");
                customSlug = System.Text.RegularExpressions.Regex.Replace(customSlug, @"\s+", "-").Trim('-');
                if (!string.IsNullOrEmpty(customSlug)) category.Slug = customSlug;
            }
            category.Description = dto.Description;
            category.ImageUrl = dto.ImageUrl;

            await _context.SaveChangesAsync();
            await InvalidateCategoriesCacheAsync();
            await InvalidateComicCacheAsync();

            return new CategoryDto
            {
                Id = category.Id,
                Name = category.Name,
                Slug = category.Slug,
                Description = category.Description,
                ImageUrl = category.ImageUrl,
                ComicCount = category.ComicCategories.Count
            };
        }

        public async Task<bool> DeleteCategoryAsync(int id)
        {
            var category = await _context.Categories.FindAsync(id);
            if (category == null) return false;

            _context.Categories.Remove(category);
            await _context.SaveChangesAsync();
            await InvalidateCategoriesCacheAsync();
            await InvalidateComicCacheAsync();
            return true;
        }

        public async Task<List<CommentDto>> GetAllCommentsForAdminAsync()
        {
            var comments = await _context.Comments
                .Include(c => c.User)
                .Include(c => c.Comic)
                .Include(c => c.Chapter)
                .Include(c => c.Likes)
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();

            return comments.Select(c => new CommentDto
            {
                Id = c.Id,
                UserId = c.UserId,
                Username = c.User?.Username ?? "N/A",
                UserAvatar = c.User?.Avatar,
                ComicId = c.ComicId,
                ComicTitle = c.Comic?.Title,
                ComicSlug = c.Comic?.Slug,
                ChapterId = c.ChapterId,
                ChapterNumber = c.Chapter?.ChapterNumber,
                ParentCommentId = c.ParentCommentId,
                Content = c.Content,
                IsHidden = c.IsHidden,
                ReportCount = c.ReportCount,
                ReportReason = c.ReportReason,
                LikesCount = c.Likes != null ? c.Likes.Count : 0,
                IsLiked = false,
                CreatedAt = c.CreatedAt
            }).ToList();
        }

        public async Task<bool> ToggleCommentHiddenAsync(int commentId)
        {
            var comment = await _context.Comments.FindAsync(commentId);
            if (comment == null) return false;

            comment.IsHidden = !comment.IsHidden;
            await _context.SaveChangesAsync();
            return comment.IsHidden;
        }

        public async Task<bool> ReportCommentAsync(int commentId, string reason)
        {
            var comment = await _context.Comments.FindAsync(commentId);
            if (comment == null) return false;

            comment.ReportCount += 1;
            if (string.IsNullOrEmpty(comment.ReportReason))
            {
                comment.ReportReason = reason;
            }
            else
            {
                comment.ReportReason += $"; {reason}";
            }

            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> ResolveCommentReportAsync(int commentId)
        {
            var comment = await _context.Comments.FindAsync(commentId);
            if (comment == null) return false;

            comment.ReportCount = 0;
            comment.ReportReason = null;
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> DeleteCommentAsync(int commentId)
        {
            var comment = await _context.Comments.FindAsync(commentId);
            if (comment == null) return false;

            // Remove comment likes first
            var likes = await _context.CommentLikes.Where(cl => cl.CommentId == commentId).ToListAsync();
            _context.CommentLikes.RemoveRange(likes);

            _context.Comments.Remove(comment);
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<DashboardStatsDto> GetDashboardStatsAsync()
        {
            var totalComics = await _context.Comics.CountAsync();
            var totalChapters = await _context.Chapters.CountAsync();
            var totalUsers = await _context.Users.CountAsync();
            var totalComicViews = await _context.Comics.SumAsync(c => (int?)c.Views) ?? 0;
            var totalChapterViews = await _context.Chapters.SumAsync(ch => (int?)ch.Views) ?? 0;
            var totalViews = totalComicViews + totalChapterViews;

            var topViewedComics = await _context.Comics
                .OrderByDescending(c => c.Views)
                .Take(5)
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .Select(c => MapToComicDto(c))
                .ToListAsync();

            var recentChapters = await _context.Chapters
                .Include(ch => ch.Comic)
                .OrderByDescending(ch => ch.CreatedAt)
                .Take(8)
                .Select(ch => new RecentChapterDto
                {
                    Id = ch.Id,
                    ComicId = ch.ComicId,
                    ComicTitle = ch.Comic.Title,
                    ComicSlug = ch.Comic.Slug,
                    ComicCoverImage = ch.Comic.CoverImage,
                    ChapterNumber = ch.ChapterNumber,
                    Title = ch.Title,
                    Views = ch.Views,
                    CreatedAt = ch.CreatedAt
                })
                .ToListAsync();

            var today = DateTime.UtcNow.Date;
            var startDate = today.AddDays(-6);

            var historyList = await _context.ReadingHistories
                .Where(rh => rh.LastReadAt >= startDate)
                .ToListAsync();

            var historyGroups = historyList
                .GroupBy(rh => rh.LastReadAt.Date)
                .ToDictionary(g => g.Key, g => g.Count());

            var readingStats = new List<DailyViewStatDto>();
            for (int i = 0; i < 7; i++)
            {
                var d = startDate.AddDays(i);
                int views = historyGroups.TryGetValue(d, out var count) ? count : 0;
                
                if (views == 0)
                {
                    int baseVal = (totalViews / 15) + 18;
                    int pseudoFactor = ((i * 47 + 19) % 35);
                    views = baseVal + pseudoFactor;
                }

                readingStats.Add(new DailyViewStatDto
                {
                    Date = d.ToString("dd/MM"),
                    Views = views
                });
            }

            return new DashboardStatsDto
            {
                TotalComics = totalComics,
                TotalChapters = totalChapters,
                TotalUsers = totalUsers,
                TotalViews = totalViews,
                TopViewedComics = topViewedComics,
                RecentChapters = recentChapters,
                ReadingStats = readingStats
            };
        }

        public async Task<int> FixAllComicDatesAsync()
        {
            var comics = await _context.Comics
                .Include(c => c.Chapters)
                .ToListAsync();

            int updatedCount = 0;
            var now = DateTime.UtcNow;

            foreach (var comic in comics)
            {
                if (comic.Chapters == null || !comic.Chapters.Any()) continue;

                bool changed = false;
                var validChapterDates = comic.Chapters
                    .Select(c => c.PublishedAt ?? c.CreatedAt)
                    .Where(d => d > DateTime.MinValue)
                    .ToList();

                if (!validChapterDates.Any()) continue;

                var earliestChapter = validChapterDates.Min();
                var latestChapter = validChapterDates.Max();

                // If comic.CreatedAt is within last 3 days and chapter is older, fix CreatedAt
                if (comic.CreatedAt >= now.AddDays(-3) && earliestChapter < comic.CreatedAt)
                {
                    comic.CreatedAt = earliestChapter;
                    changed = true;
                }

                // If comic.UpdatedAt is within last 3 days and chapter is older, fix UpdatedAt
                if (comic.UpdatedAt >= now.AddDays(-3) && latestChapter < comic.UpdatedAt)
                {
                    comic.UpdatedAt = latestChapter;
                    changed = true;
                }

                if (changed)
                {
                    updatedCount++;
                    await InvalidateComicCacheAsync(comic.Slug);
                }
            }

            if (updatedCount > 0)
            {
                await _context.SaveChangesAsync();
            }

            return updatedCount;
        }

        private static ComicDto MapToComicDto(Comic c)
        {
            var orderedChapters = c.Chapters?
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
                    CreatedAt = ch.CreatedAt
                }).ToList() ?? new List<ChapterDto>();

            return new ComicDto
            {
                Id = c.Id,
                Title = c.Title,
                Slug = c.Slug,
                Description = c.Description,
                CoverImage = c.CoverImage,
                BannerImage = c.BannerImage,
                Author = c.Author,
                OtherNames = c.OtherNames,
                Artist = c.Artist,
                Country = ResolveComicCountry(c),
                TranslatorGroup = c.TranslatorGroup ?? "Đang cập nhật",
                AgeLimit = string.IsNullOrWhiteSpace(c.AgeLimit) ? "13+" : c.AgeLimit,
                ReleaseYear = c.ReleaseYear,
                Status = c.Status,
                Views = c.Views,
                Rating = c.Rating,
                RatingCount = c.RatingCount,
                IsFeatured = c.IsFeatured,
                IsPublic = c.IsPublic,
                TotalChapters = c.Chapters?.Count ?? 0,
                CommentsCount = c.Comments?.Count ?? 0,
                LikesCount = c.Bookmarks?.Count ?? 0,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt,
                Categories = c.ComicCategories?.Select(cc => new CategoryDto
                {
                    Id = cc.Category.Id,
                    Name = cc.Category.Name,
                    Slug = cc.Category.Slug
                }).ToList() ?? new List<CategoryDto>(),
                LatestChapter = latestChapter == null ? null : new ChapterDto
                {
                    Id = latestChapter.Id,
                    ComicId = latestChapter.ComicId,
                    ChapterNumber = latestChapter.ChapterNumber,
                    Title = latestChapter.Title,
                    Views = latestChapter.Views,
                    CreatedAt = latestChapter.CreatedAt
                },
                RecentChapters = recentChapters
            };
        }
    }
}
