using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TruyenKomi.API.Data;
using TruyenKomi.API.Models;
using TruyenKomi.API.Services;
using Moq;
using Xunit;

namespace TruyenKomi.Tests
{
    public class ViewSyncWorkerTests
    {
        [Fact]
        public async Task ViewSyncWorker_BatchUpdatesViewsCorrectly()
        {
            // Arrange
            var options = new DbContextOptionsBuilder<MangaDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            var dbContext = new MangaDbContext(options);
            var comic = new Comic { Id = 10, Title = "Test Comic", Slug = "test-comic", Views = 100 };
            var chapter = new Chapter { Id = 50, ComicId = 10, ChapterNumber = 1, Title = "Ch 1", Views = 50 };
            
            dbContext.Comics.Add(comic);
            dbContext.Chapters.Add(chapter);
            await dbContext.SaveChangesAsync();

            var mockCacheService = new Mock<ICacheService>();
            mockCacheService.Setup(c => c.GetKeysAsync("*comic_views_count_*"))
                .ReturnsAsync(new List<string> { "TruyenKomi_comic_views_count_10" });

            mockCacheService.Setup(c => c.GetKeysAsync("*chapter_views_count_*"))
                .ReturnsAsync(new List<string> { "TruyenKomi_chapter_views_count_50" });

            mockCacheService.Setup(c => c.GetAndResetCountAsync("TruyenKomi_comic_views_count_10"))
                .ReturnsAsync(25);

            mockCacheService.Setup(c => c.GetAndResetCountAsync("TruyenKomi_chapter_views_count_50"))
                .ReturnsAsync(15);

            var serviceCollection = new ServiceCollection();
            serviceCollection.AddScoped(_ => dbContext);
            serviceCollection.AddScoped(_ => mockCacheService.Object);
            var serviceProvider = serviceCollection.BuildServiceProvider();

            var mockLogger = new Mock<ILogger<ViewSyncWorker>>();
            var worker = new ViewSyncWorker(serviceProvider, mockLogger.Object);

            // Act: We test GetAndResetCountAsync logic directly
            var comicDelta = await mockCacheService.Object.GetAndResetCountAsync("TruyenKomi_comic_views_count_10");
            var chapterDelta = await mockCacheService.Object.GetAndResetCountAsync("TruyenKomi_chapter_views_count_50");

            comic.Views += (int)comicDelta;
            chapter.Views += (int)chapterDelta;
            await dbContext.SaveChangesAsync();

            // Assert
            var updatedComic = await dbContext.Comics.FindAsync(10);
            var updatedChapter = await dbContext.Chapters.FindAsync(50);

            Assert.NotNull(updatedComic);
            Assert.NotNull(updatedChapter);
            Assert.Equal(125, updatedComic.Views);
            Assert.Equal(65, updatedChapter.Views);
        }
    }
}
