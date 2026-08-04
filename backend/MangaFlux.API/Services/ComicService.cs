using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using MangaFlux.API.Data;
using MangaFlux.API.DTOs;
using MangaFlux.API.Models;

namespace MangaFlux.API.Services
{
    public interface IComicService
    {
        Task<List<ComicDto>> GetFeaturedComicsAsync();
        Task<List<ComicDto>> GetLatestComicsAsync(int count = 12);
        Task<List<ComicDto>> SearchComicsAsync(string? query, string? categorySlug, string? status, string? sortBy);
        Task<ComicDetailDto?> GetComicBySlugAsync(string slug);
        Task<ChapterDetailDto?> GetChapterByIdAsync(int chapterId);
        Task<List<CategoryDto>> GetAllCategoriesAsync();
        Task<CommentDto> AddCommentAsync(int userId, CreateCommentDto dto);
        Task<bool> LikeCommentAsync(int userId, int commentId);

        // Admin operations
        Task<ComicDto> CreateComicAsync(ComicCreateUpdateDto dto);
        Task<ComicDto?> UpdateComicAsync(int id, ComicCreateUpdateDto dto);
        Task<bool> DeleteComicAsync(int id);
        Task<ChapterDto> AddChapterAsync(ChapterCreateDto dto);
    }

    public class ComicService : IComicService
    {
        private readonly MangaDbContext _context;
        private readonly INotificationService _notificationService;

        public ComicService(MangaDbContext context, INotificationService notificationService)
        {
            _context = context;
            _notificationService = notificationService;
        }

        public async Task<List<ComicDto>> GetFeaturedComicsAsync()
        {
            return await _context.Comics
                .Where(c => c.IsFeatured)
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .Select(c => MapToComicDto(c))
                .ToListAsync();
        }

        public async Task<List<ComicDto>> GetLatestComicsAsync(int count = 12)
        {
            return await _context.Comics
                .OrderByDescending(c => c.UpdatedAt)
                .Take(count)
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .Select(c => MapToComicDto(c))
                .ToListAsync();
        }

        public async Task<List<ComicDto>> SearchComicsAsync(string? query, string? categorySlug, string? status, string? sortBy)
        {
            var comicsQuery = _context.Comics
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
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

            comicsQuery = sortBy switch
            {
                "views" => comicsQuery.OrderByDescending(c => c.Views),
                "rating" => comicsQuery.OrderByDescending(c => c.Rating),
                "title" => comicsQuery.OrderBy(c => c.Title),
                _ => comicsQuery.OrderByDescending(c => c.UpdatedAt)
            };

            var comics = await comicsQuery.ToListAsync();
            return comics.Select(c => MapToComicDto(c)).ToList();
        }

        public async Task<ComicDetailDto?> GetComicBySlugAsync(string slug)
        {
            var comic = await _context.Comics
                .Include(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(c => c.Chapters)
                .Include(c => c.Comments).ThenInclude(cm => cm.User)
                .Include(c => c.Comments).ThenInclude(cm => cm.Likes)
                .FirstOrDefaultAsync(c => c.Slug == slug);

            if (comic == null) return null;

            // Increment view count
            comic.Views += 1;
            await _context.SaveChangesAsync();

            var detailDto = new ComicDetailDto
            {
                Id = comic.Id,
                Title = comic.Title,
                Slug = comic.Slug,
                Description = comic.Description,
                CoverImage = comic.CoverImage,
                BannerImage = comic.BannerImage,
                Author = comic.Author,
                Status = comic.Status,
                Views = comic.Views,
                Rating = comic.Rating,
                IsFeatured = comic.IsFeatured,
                UpdatedAt = comic.UpdatedAt,
                Categories = comic.ComicCategories.Select(cc => new CategoryDto
                {
                    Id = cc.Category.Id,
                    Name = cc.Category.Name,
                    Slug = cc.Category.Slug
                }).ToList(),
                Chapters = comic.Chapters.OrderBy(ch => ch.ChapterNumber).Select(ch => new ChapterDto
                {
                    Id = ch.Id,
                    ComicId = ch.ComicId,
                    ChapterNumber = ch.ChapterNumber,
                    Title = ch.Title,
                    Views = ch.Views,
                    CreatedAt = ch.CreatedAt
                }).ToList(),
                Comments = comic.Comments.OrderByDescending(cm => cm.CreatedAt).Select(cm => new CommentDto
                {
                    Id = cm.Id,
                    UserId = cm.UserId,
                    Username = cm.User.Username,
                    UserAvatar = cm.User.Avatar,
                    ComicId = cm.ComicId,
                    ChapterId = cm.ChapterId,
                    ParentCommentId = cm.ParentCommentId,
                    Content = cm.Content,
                    LikesCount = cm.Likes.Count,
                    IsLiked = false,
                    CreatedAt = cm.CreatedAt
                }).ToList()
            };

            return detailDto;
        }

        public async Task<ChapterDetailDto?> GetChapterByIdAsync(int chapterId)
        {
            var chapter = await _context.Chapters
                .Include(ch => ch.Comic)
                .Include(ch => ch.Pages)
                .FirstOrDefaultAsync(ch => ch.Id == chapterId);

            if (chapter == null) return null;

            // Increment Chapter views
            chapter.Views += 1;
            await _context.SaveChangesAsync();

            var allChapters = await _context.Chapters
                .Where(ch => ch.ComicId == chapter.ComicId)
                .OrderBy(ch => ch.ChapterNumber)
                .Select(ch => new ChapterDto
                {
                    Id = ch.Id,
                    ComicId = ch.ComicId,
                    ChapterNumber = ch.ChapterNumber,
                    Title = ch.Title,
                    Views = ch.Views,
                    CreatedAt = ch.CreatedAt
                })
                .ToListAsync();

            return new ChapterDetailDto
            {
                Id = chapter.Id,
                ComicId = chapter.ComicId,
                ComicTitle = chapter.Comic.Title,
                ComicSlug = chapter.Comic.Slug,
                ChapterNumber = chapter.ChapterNumber,
                Title = chapter.Title,
                Views = chapter.Views,
                CreatedAt = chapter.CreatedAt,
                Pages = chapter.Pages.OrderBy(p => p.PageNumber).Select(p => new ChapterPageDto
                {
                    Id = p.Id,
                    PageNumber = p.PageNumber,
                    ImageUrl = p.ImageUrl
                }).ToList(),
                AllChapters = allChapters
            };
        }

        public async Task<List<CategoryDto>> GetAllCategoriesAsync()
        {
            return await _context.Categories
                .Select(cat => new CategoryDto
                {
                    Id = cat.Id,
                    Name = cat.Name,
                    Slug = cat.Slug,
                    Description = cat.Description,
                    ComicCount = cat.ComicCategories.Count
                })
                .ToListAsync();
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
                Content = dto.Content,
                CreatedAt = DateTime.UtcNow
            };

            _context.Comments.Add(comment);
            await _context.SaveChangesAsync();

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

            return new CommentDto
            {
                Id = comment.Id,
                UserId = user!.Id,
                Username = user.Username,
                UserAvatar = user.Avatar,
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

        // Admin CRUD
        public async Task<ComicDto> CreateComicAsync(ComicCreateUpdateDto dto)
        {
            var slug = dto.Title.ToLower().Replace(" ", "-").Replace(":", "");
            var comic = new Comic
            {
                Title = dto.Title,
                Slug = slug,
                Description = dto.Description,
                CoverImage = dto.CoverImage,
                BannerImage = dto.BannerImage,
                Author = dto.Author,
                Status = dto.Status,
                IsFeatured = dto.IsFeatured,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
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
            }

            return MapToComicDto(comic);
        }

        public async Task<ComicDto?> UpdateComicAsync(int id, ComicCreateUpdateDto dto)
        {
            var comic = await _context.Comics.Include(c => c.ComicCategories).FirstOrDefaultAsync(c => c.Id == id);
            if (comic == null) return null;

            comic.Title = dto.Title;
            comic.Description = dto.Description;
            comic.CoverImage = dto.CoverImage;
            comic.BannerImage = dto.BannerImage;
            comic.Author = dto.Author;
            comic.Status = dto.Status;
            comic.IsFeatured = dto.IsFeatured;
            comic.UpdatedAt = DateTime.UtcNow;

            _context.ComicCategories.RemoveRange(comic.ComicCategories);
            foreach (var catId in dto.CategoryIds)
            {
                _context.ComicCategories.Add(new ComicCategory { ComicId = comic.Id, CategoryId = catId });
            }

            await _context.SaveChangesAsync();
            return MapToComicDto(comic);
        }

        public async Task<bool> DeleteComicAsync(int id)
        {
            var comic = await _context.Comics.FindAsync(id);
            if (comic == null) return false;

            _context.Comics.Remove(comic);
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<ChapterDto> AddChapterAsync(ChapterCreateDto dto)
        {
            var chapter = new Chapter
            {
                ComicId = dto.ComicId,
                ChapterNumber = dto.ChapterNumber,
                Title = dto.Title,
                CreatedAt = DateTime.UtcNow
            };

            _context.Chapters.Add(chapter);
            await _context.SaveChangesAsync();

            for (int i = 0; i < dto.ImageUrls.Count; i++)
            {
                _context.ChapterPages.Add(new ChapterPage
                {
                    ChapterId = chapter.Id,
                    PageNumber = i + 1,
                    ImageUrl = dto.ImageUrls[i]
                });
            }

            // Update comic updated time
            var comic = await _context.Comics.FindAsync(dto.ComicId);
            if (comic != null) comic.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Notify bookmarked users
            var bookmarkedUserIds = await _context.Bookmarks
                .Where(b => b.ComicId == dto.ComicId)
                .Select(b => b.UserId)
                .ToListAsync();

            if (comic != null && bookmarkedUserIds.Any())
            {
                foreach (var uId in bookmarkedUserIds)
                {
                    var link = $"/read/{chapter.Id}";
                    var title = "Chapter mới!";
                    var message = $"Truyện '{comic.Title}' bạn theo dõi vừa có Chapter {dto.ChapterNumber}.";
                    await _notificationService.CreateNotificationAsync(uId, "NewChapter", title, message, link);
                }
            }

            return new ChapterDto
            {
                Id = chapter.Id,
                ComicId = chapter.ComicId,
                ChapterNumber = chapter.ChapterNumber,
                Title = chapter.Title,
                Views = chapter.Views,
                CreatedAt = chapter.CreatedAt
            };
        }

        private static ComicDto MapToComicDto(Comic c)
        {
            var latestChapter = c.Chapters?.OrderByDescending(ch => ch.ChapterNumber).FirstOrDefault();

            return new ComicDto
            {
                Id = c.Id,
                Title = c.Title,
                Slug = c.Slug,
                Description = c.Description,
                CoverImage = c.CoverImage,
                BannerImage = c.BannerImage,
                Author = c.Author,
                Status = c.Status,
                Views = c.Views,
                Rating = c.Rating,
                IsFeatured = c.IsFeatured,
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
                }
            };
        }
    }
}
