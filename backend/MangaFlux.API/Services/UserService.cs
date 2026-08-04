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
    public interface IUserService
    {
        Task<List<BookmarkDto>> GetUserBookmarksAsync(int userId);
        Task<bool> AddBookmarkAsync(int userId, int comicId);
        Task<bool> RemoveBookmarkAsync(int userId, int comicId);
        Task<List<ReadingHistoryDto>> GetUserHistoryAsync(int userId);
        Task<bool> TrackReadingHistoryAsync(int userId, int comicId, int chapterId);
    }

    public class UserService : IUserService
    {
        private readonly MangaDbContext _context;

        public UserService(MangaDbContext context)
        {
            _context = context;
        }

        public async Task<List<BookmarkDto>> GetUserBookmarksAsync(int userId)
        {
            var bookmarks = await _context.Bookmarks
                .Where(b => b.UserId == userId)
                .Include(b => b.Comic).ThenInclude(c => c.ComicCategories).ThenInclude(cc => cc.Category)
                .Include(b => b.Comic).ThenInclude(c => c.Chapters)
                .OrderByDescending(b => b.CreatedAt)
                .ToListAsync();

            return bookmarks.Select(b => new BookmarkDto
            {
                Id = b.Id,
                ComicId = b.ComicId,
                CreatedAt = b.CreatedAt,
                Comic = new ComicDto
                {
                    Id = b.Comic.Id,
                    Title = b.Comic.Title,
                    Slug = b.Comic.Slug,
                    CoverImage = b.Comic.CoverImage,
                    Author = b.Comic.Author,
                    Status = b.Comic.Status,
                    Rating = b.Comic.Rating,
                    Views = b.Comic.Views,
                    UpdatedAt = b.Comic.UpdatedAt,
                    Categories = b.Comic.ComicCategories.Select(cc => new CategoryDto
                    {
                        Id = cc.Category.Id,
                        Name = cc.Category.Name,
                        Slug = cc.Category.Slug
                    }).ToList()
                }
            }).ToList();
        }

        public async Task<bool> AddBookmarkAsync(int userId, int comicId)
        {
            var exists = await _context.Bookmarks.AnyAsync(b => b.UserId == userId && b.ComicId == comicId);
            if (exists) return true;

            _context.Bookmarks.Add(new Bookmark
            {
                UserId = userId,
                ComicId = comicId,
                CreatedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> RemoveBookmarkAsync(int userId, int comicId)
        {
            var bookmark = await _context.Bookmarks.FirstOrDefaultAsync(b => b.UserId == userId && b.ComicId == comicId);
            if (bookmark == null) return false;

            _context.Bookmarks.Remove(bookmark);
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<List<ReadingHistoryDto>> GetUserHistoryAsync(int userId)
        {
            var history = await _context.ReadingHistories
                .Where(h => h.UserId == userId)
                .Include(h => h.Comic)
                .Include(h => h.Chapter)
                .OrderByDescending(h => h.LastReadAt)
                .ToListAsync();

            return history.Select(h => new ReadingHistoryDto
            {
                Id = h.Id,
                ComicId = h.ComicId,
                ChapterId = h.ChapterId,
                LastReadAt = h.LastReadAt,
                Comic = new ComicDto
                {
                    Id = h.Comic.Id,
                    Title = h.Comic.Title,
                    Slug = h.Comic.Slug,
                    CoverImage = h.Comic.CoverImage,
                    Author = h.Comic.Author,
                    Status = h.Comic.Status
                },
                Chapter = new ChapterDto
                {
                    Id = h.Chapter.Id,
                    ComicId = h.Chapter.ComicId,
                    ChapterNumber = h.Chapter.ChapterNumber,
                    Title = h.Chapter.Title,
                    CreatedAt = h.Chapter.CreatedAt
                }
            }).ToList();
        }

        public async Task<bool> TrackReadingHistoryAsync(int userId, int comicId, int chapterId)
        {
            var historyItem = await _context.ReadingHistories
                .FirstOrDefaultAsync(h => h.UserId == userId && h.ComicId == comicId);

            if (historyItem == null)
            {
                _context.ReadingHistories.Add(new ReadingHistory
                {
                    UserId = userId,
                    ComicId = comicId,
                    ChapterId = chapterId,
                    LastReadAt = DateTime.UtcNow
                });
            }
            else
            {
                historyItem.ChapterId = chapterId;
                historyItem.LastReadAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            return true;
        }
    }
}
