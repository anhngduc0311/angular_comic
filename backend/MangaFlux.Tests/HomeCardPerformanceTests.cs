using Microsoft.EntityFrameworkCore;
using Moq;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;
using TruyenKomi.API.Services;
using Xunit;

namespace TruyenKomi.Tests;

public class HomeCardPerformanceTests
{
    [Fact]
    public async Task Lists_PreserveFullChapterCountsAndCategories_WhenOnlyRecentChaptersAreLoaded()
    {
        var options = new DbContextOptionsBuilder<MangaDbContext>();
        // Set only to a disposable PostgreSQL database for relational verification.
        var postgres = Environment.GetEnvironmentVariable("HOME_CARD_TEST_POSTGRES");
        if (string.IsNullOrEmpty(postgres)) options.UseInMemoryDatabase(Guid.NewGuid().ToString());
        else options.UseNpgsql(postgres);
        await using var db = new MangaDbContext(options.Options);
        await db.Database.EnsureCreatedAsync();
        var comic = new Comic { Title = "Long running manga", Slug = Guid.NewGuid().ToString(), IsPublic = true };
        comic.ComicCategories.Add(new ComicCategory { Category = new Category { Name = "Action", Slug = Guid.NewGuid().ToString() } });
        comic.ComicCategories.Add(new ComicCategory { Category = new Category { Name = "Comedy", Slug = Guid.NewGuid().ToString() } });
        for (var number = 1; number <= 100; number++)
            comic.Chapters.Add(new Chapter { ChapterNumber = number, Title = $"Chapter {number}" });
        db.Comics.Add(comic);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var cache = new Mock<ICacheService>();
        cache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<List<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
            .Returns<string, Func<Task<List<ComicDto>>>, TimeSpan?>(async (_, factory, _) => await factory());
        cache.Setup(c => c.GetOrSetAsync(It.IsAny<string>(), It.IsAny<Func<Task<PagedSearchResultDto<ComicDto>>>>(), It.IsAny<TimeSpan?>()))
            .Returns<string, Func<Task<PagedSearchResultDto<ComicDto>>>, TimeSpan?>(async (_, factory, _) => await factory());
        var service = new ComicService(db, Mock.Of<INotificationService>(), cache.Object, Mock.Of<IGamificationService>());

        var latest = await service.GetLatestComicsAsync();
        var featured = await service.GetFeaturedComicsAsync();
        var search = await service.SearchComicsAsync(null, null, null, "latest");
        foreach (var cards in new[] { latest, featured, search.Items })
        {
            var card = Assert.Single(cards);
            Assert.Equal(100, card.TotalChapters);
            Assert.True(card.HasChapterOne);
            Assert.Equal(1m, card.FirstChapterNumber);
            Assert.Equal(100d, card.LatestChapter!.ChapterNumber);
            Assert.Equal(new double[] { 100, 99, 98 }, card.RecentChapters.Select(ch => ch.ChapterNumber));
            Assert.Equal(2, card.Categories.Count);
        }
        Assert.Empty(db.ChangeTracker.Entries());
    }
}
