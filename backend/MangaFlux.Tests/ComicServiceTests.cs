using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;
using TruyenKomi.API.Services;
using Moq;
using Xunit;

namespace TruyenKomi.Tests
{
    public class ComicServiceTests
    {
        private MangaDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<MangaDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new MangaDbContext(options);
        }

        [Fact]
        public async Task GetAllCategoriesAsync_ShouldReturnCategoryList()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            db.Categories.Add(new Category { Id = 1, Name = "Action", Slug = "action" });
            db.Categories.Add(new Category { Id = 2, Name = "Comedy", Slug = "comedy" });
            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<System.Collections.Generic.List<CategoryDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<System.Collections.Generic.List<CategoryDto>>>, TimeSpan?>((key, cb, ttl) => cb());
            var mockGamification = new Mock<IGamificationService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object, mockGamification.Object);

            // Act
            var categories = await comicService.GetAllCategoriesAsync();

            // Assert
            Assert.NotNull(categories);
            Assert.Equal(2, categories.Count);
        }

        [Fact]
        public async Task SearchComicsAsync_SortByChapters_ShouldOrderByChapterCountDescending()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var comicFewChapters = new Comic { Id = 1, Title = "Comic Few", Slug = "comic-few", IsPublic = true };
            var comicManyChapters = new Comic { Id = 2, Title = "Comic Many", Slug = "comic-many", IsPublic = true };
            db.Comics.AddRange(comicFewChapters, comicManyChapters);

            // 1 chapter for comic 1
            db.Chapters.Add(new Chapter { Id = 101, ComicId = 1, ChapterNumber = 1, Title = "Ch 1" });

            // 3 chapters for comic 2
            db.Chapters.Add(new Chapter { Id = 201, ComicId = 2, ChapterNumber = 1, Title = "Ch 1" });
            db.Chapters.Add(new Chapter { Id = 202, ComicId = 2, ChapterNumber = 2, Title = "Ch 2" });
            db.Chapters.Add(new Chapter { Id = 203, ComicId = 2, ChapterNumber = 3, Title = "Ch 3" });

            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            var mockGamification = new Mock<IGamificationService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object, mockGamification.Object);

            // Act
            var results = await comicService.SearchComicsAsync(null, null, null, "chapters");

            // Assert
            Assert.NotNull(results);
            Assert.Equal(2, results.TotalCount);
            Assert.Equal(2, results.Items.Count);
            Assert.Equal("comic-many", results.Items[0].Slug);
            Assert.Equal(3, results.Items[0].TotalChapters);
            Assert.Equal("comic-few", results.Items[1].Slug);
            Assert.Equal(1, results.Items[1].TotalChapters);
        }

        [Fact]
        public async Task SearchComicsAsync_Pagination_ShouldReturnCorrectPageAndSize()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            for (int i = 1; i <= 30; i++)
            {
                db.Comics.Add(new Comic { Id = i, Title = $"Comic {i:D2}", Slug = $"comic-{i}", IsPublic = true });
            }
            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            var mockGamification = new Mock<IGamificationService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object, mockGamification.Object);

            // Act: page 2, pageSize 10
            var results = await comicService.SearchComicsAsync(null, null, null, "latest", null, page: 2, pageSize: 10);

            // Assert
            Assert.NotNull(results);
            Assert.Equal(30, results.TotalCount);
            Assert.Equal(10, results.Items.Count);
            Assert.Equal(2, results.Page);
            Assert.Equal(10, results.PageSize);
            Assert.Equal(3, results.TotalPages);
        }
    }
}
