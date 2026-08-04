using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MangaFlux.API.Data;
using MangaFlux.API.Models;
using MangaFlux.API.Services;
using Moq;
using Xunit;

namespace MangaFlux.Tests
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
            var cache = new MemoryCache(new MemoryCacheOptions());
            var comicService = new ComicService(db, mockNotificationService.Object, cache);

            // Act
            var categories = await comicService.GetAllCategoriesAsync();

            // Assert
            Assert.NotNull(categories);
            Assert.Equal(2, categories.Count);
        }
    }
}
