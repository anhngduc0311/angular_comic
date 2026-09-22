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
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<PagedSearchResultDto<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<PagedSearchResultDto<ComicDto>>>, TimeSpan?>((key, cb, ttl) => cb());
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
                db.Chapters.Add(new Chapter { Id = 1000 + i, ComicId = i, ChapterNumber = 1.0, Title = "Chapter 1" });
            }
            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<PagedSearchResultDto<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<PagedSearchResultDto<ComicDto>>>, TimeSpan?>((key, cb, ttl) => cb());
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

        [Fact]
        public async Task GetFeaturedComicsAsync_Criteria_ShouldSortProperly()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            // Comic 1: low views, old update, 3 chapters
            var c1 = new Comic { Id = 1, Title = "C1", Slug = "c1", Views = 10, UpdatedAt = DateTime.UtcNow.AddDays(-10), IsPublic = true };
            // Comic 2: highest views, middle update, 1 chapter
            var c2 = new Comic { Id = 2, Title = "C2", Slug = "c2", Views = 9999, UpdatedAt = DateTime.UtcNow.AddDays(-5), IsPublic = true };
            // Comic 3: middle views, latest update, 2 chapters
            var c3 = new Comic { Id = 3, Title = "C3", Slug = "c3", Views = 500, UpdatedAt = DateTime.UtcNow, IsPublic = true };

            db.Comics.AddRange(c1, c2, c3);

            // Add chapters: c1 has 3 chapters, c2 has 1 chapter, c3 has 2 chapters
            db.Chapters.Add(new Chapter { Id = 101, ComicId = 1, ChapterNumber = 1, Title = "C1-1" });
            db.Chapters.Add(new Chapter { Id = 102, ComicId = 1, ChapterNumber = 2, Title = "C1-2" });
            db.Chapters.Add(new Chapter { Id = 103, ComicId = 1, ChapterNumber = 3, Title = "C1-3" });

            db.Chapters.Add(new Chapter { Id = 201, ComicId = 2, ChapterNumber = 1, Title = "C2-1" });

            db.Chapters.Add(new Chapter { Id = 301, ComicId = 3, ChapterNumber = 1, Title = "C3-1" });
            db.Chapters.Add(new Chapter { Id = 302, ComicId = 3, ChapterNumber = 2, Title = "C3-2" });

            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<List<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<List<ComicDto>>>, TimeSpan?>((k, cb, ttl) => cb());
            var mockGamification = new Mock<IGamificationService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object, mockGamification.Object);

            // Act & Assert 1: Views (default)
            var byViews = await comicService.GetFeaturedComicsAsync("views", 10);
            Assert.Equal("c2", byViews[0].Slug); // C2 has highest views (9999)

            // Act & Assert 2: Latest
            var byLatest = await comicService.GetFeaturedComicsAsync("latest", 10);
            Assert.Equal("c3", byLatest[0].Slug); // C3 is newest updated (UtcNow)

            // Act & Assert 3: Chapters
            var byChapters = await comicService.GetFeaturedComicsAsync("chapters", 10);
            Assert.Equal("c1", byChapters[0].Slug); // C1 has 3 chapters
        }

        [Fact]
        public async Task GetFeaturedComicsAsync_CriteriaRomance_ShouldFilterRomanceCategory()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var romanceCategory = new Category { Id = 10, Name = "Ngôn Tình", Slug = "ngon-tinh" };
            var actionCategory = new Category { Id = 20, Name = "Hành Động", Slug = "hanh-dong" };
            db.Categories.AddRange(romanceCategory, actionCategory);

            var actionComic = new Comic { Id = 1, Title = "Action Hero", Slug = "action-hero", Views = 10000, IsPublic = true };
            var romanceComic = new Comic { Id = 2, Title = "Romance Love", Slug = "romance-love", Views = 5000, IsPublic = true };
            db.Comics.AddRange(actionComic, romanceComic);

            db.ComicCategories.Add(new ComicCategory { ComicId = 1, CategoryId = 20 });
            db.ComicCategories.Add(new ComicCategory { ComicId = 2, CategoryId = 10 });

            db.Chapters.Add(new Chapter { Id = 1, ComicId = 1, ChapterNumber = 1, Title = "Ch 1" });
            db.Chapters.Add(new Chapter { Id = 2, ComicId = 2, ChapterNumber = 1, Title = "Ch 1" });

            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<List<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<List<ComicDto>>>, TimeSpan?>((k, cb, ttl) => cb());
            var mockGamification = new Mock<IGamificationService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object, mockGamification.Object);

            // Act
            var results = await comicService.GetFeaturedComicsAsync("romance", 10);

            // Assert
            Assert.NotNull(results);
            Assert.Single(results);
            Assert.Equal("romance-love", results[0].Slug);
        }

        [Fact]
        public async Task GetRecommendedComicsByYearAsync_ShouldReturnComicsWithSameYear()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var comicCurrent = new Comic { Id = 1, Title = "Current Manga", Slug = "current-manga", ReleaseYear = 2024, Views = 100, IsPublic = true };
            var comicSameYear = new Comic { Id = 2, Title = "Same Year Manga", Slug = "same-year-manga", ReleaseYear = 2024, Views = 500, IsPublic = true };
            var comicDiffYear = new Comic { Id = 3, Title = "Diff Year Manga", Slug = "diff-year-manga", ReleaseYear = 2018, Views = 900, IsPublic = true };
            var comicCreatedYear = new Comic { Id = 4, Title = "Created Year Manga", Slug = "created-year-manga", ReleaseYear = null, CreatedAt = new DateTime(2024, 5, 1, 0, 0, 0, DateTimeKind.Utc), Views = 300, IsPublic = true };

            db.Comics.AddRange(comicCurrent, comicSameYear, comicDiffYear, comicCreatedYear);

            db.Chapters.Add(new Chapter { Id = 1, ComicId = 1, ChapterNumber = 1, Title = "Ch 1" });
            db.Chapters.Add(new Chapter { Id = 2, ComicId = 2, ChapterNumber = 1, Title = "Ch 1" });
            db.Chapters.Add(new Chapter { Id = 3, ComicId = 3, ChapterNumber = 1, Title = "Ch 1" });
            db.Chapters.Add(new Chapter { Id = 4, ComicId = 4, ChapterNumber = 1, Title = "Ch 1" });

            await db.SaveChangesAsync();

            var mockNotificationService = new Mock<INotificationService>();
            var mockCache = new Mock<ICacheService>();
            mockCache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<List<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
                .Returns<string, Func<Task<List<ComicDto>>>, TimeSpan?>((k, cb, ttl) => cb());
            var mockGamification = new Mock<IGamificationService>();
            var comicService = new ComicService(db, mockNotificationService.Object, mockCache.Object, mockGamification.Object);

            // Act
            var results = await comicService.GetRecommendedComicsByYearAsync(comicCurrent.Id, null, 2);

            // Assert
            Assert.NotNull(results);
            Assert.Equal(2, results.Count);
            // Must exclude current comic
            Assert.DoesNotContain(results, r => r.Id == 1);
            // Must be comics from 2024 (comic 2 and comic 4)
            Assert.Equal(2, results[0].Id); // Higher views (500) first
            Assert.Equal(4, results[1].Id); // 300 views second
            Assert.Equal(2024, results[1].ReleaseYear); // ReleaseYear fallback from CreatedAt
        }
    }
}
