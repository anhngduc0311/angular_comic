using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;
using TruyenKomi.API.Services;
using Moq;
using Xunit;

namespace TruyenKomi.Tests
{
    public class SearchAndCommentsTests
    {
        private MangaDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<MangaDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new MangaDbContext(options);
        }

        [Fact]
        public async Task GetComicCommentsAsync_ShouldReturnPaginatedComments()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var user = new User { Id = 1, Username = "testuser", Email = "test@user.com", PasswordHash = "hash" };
            var comic = new Comic { Id = 10, Title = "One Piece", Slug = "one-piece", IsPublic = true };
            db.Users.Add(user);
            db.Comics.Add(comic);

            for (int i = 1; i <= 25; i++)
            {
                db.Comments.Add(new Comment
                {
                    Id = i,
                    UserId = 1,
                    ComicId = 10,
                    Content = $"Comment {i}",
                    CreatedAt = DateTime.UtcNow.AddMinutes(i),
                    IsHidden = false
                });
            }
            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object);

            // Act: Page 1 (10 items)
            var page1 = await comicService.GetComicCommentsAsync(10, page: 1, pageSize: 10);
            var page3 = await comicService.GetComicCommentsAsync(10, page: 3, pageSize: 10);

            // Assert
            Assert.Equal(25, page1.TotalCount);
            Assert.Equal(10, page1.Items.Count);
            Assert.Equal(1, page1.Page);
            Assert.Equal(3, page1.TotalPages);

            Assert.Equal(5, page3.Items.Count);
            Assert.Equal(3, page3.Page);
        }

        [Fact]
        public async Task AdvancedSearchAsync_ShouldFilterAndPaginateCorrectly()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var catAction = new Category { Id = 1, Name = "Action", Slug = "action" };
            var catRomance = new Category { Id = 2, Name = "Romance", Slug = "romance" };
            db.Categories.AddRange(catAction, catRomance);

            var comic1 = new Comic { Id = 1, Title = "Solo Leveling", Slug = "solo-leveling", Status = "Completed", Country = "Korea", Views = 5000, IsPublic = true, UpdatedAt = DateTime.UtcNow };
            var comic2 = new Comic { Id = 2, Title = "Naruto", Slug = "naruto", Status = "Completed", Country = "Japan", Views = 8000, IsPublic = true, UpdatedAt = DateTime.UtcNow };
            var comic3 = new Comic { Id = 3, Title = "One Piece", Slug = "one-piece", Status = "Ongoing", Country = "Japan", Views = 15000, IsPublic = true, UpdatedAt = DateTime.UtcNow };

            db.Comics.AddRange(comic1, comic2, comic3);
            db.ComicCategories.Add(new ComicCategory { ComicId = 1, CategoryId = 1 });
            db.ComicCategories.Add(new ComicCategory { ComicId = 2, CategoryId = 1 });
            db.ComicCategories.Add(new ComicCategory { ComicId = 3, CategoryId = 2 });

            await db.SaveChangesAsync();

            var mockCache = new Mock<ICacheService>();
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<List<SearchAutocompleteDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<List<SearchAutocompleteDto>>>, TimeSpan?>((key, cb, ttl) => cb());

            var searchService = new SearchEngineService(db, mockCache.Object);

            // Act 1: Filter by Country = Japan
            var resultJapan = await searchService.AdvancedSearchAsync(new SearchFilterDto
            {
                Country = "Japan",
                Page = 1,
                PageSize = 10
            });

            // Act 2: Filter by Text Query "solo"
            var resultSolo = await searchService.AdvancedSearchAsync(new SearchFilterDto
            {
                Query = "solo",
                Page = 1,
                PageSize = 10
            });

            // Assert
            Assert.Equal(2, resultJapan.TotalCount);
            Assert.Contains(resultJapan.Items, c => c.Title == "Naruto");
            Assert.Contains(resultJapan.Items, c => c.Title == "One Piece");

            Assert.Equal(1, resultSolo.TotalCount);
            Assert.Equal("Solo Leveling", resultSolo.Items[0].Title);
        }
    }
}
