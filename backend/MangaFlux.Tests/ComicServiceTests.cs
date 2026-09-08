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
    }
}
