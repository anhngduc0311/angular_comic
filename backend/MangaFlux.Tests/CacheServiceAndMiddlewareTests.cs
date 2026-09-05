using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TruyenKomi.API.Middleware;
using TruyenKomi.API.Services;
using Moq;
using Xunit;

namespace TruyenKomi.Tests
{
    public class CacheServiceAndMiddlewareTests
    {
        [Fact]
        public async Task CacheService_IncrementAsync_And_GetAndResetCountAsync_FallbackWorks()
        {
            // Arrange
            var opts = Options.Create(new MemoryDistributedCacheOptions());
            IDistributedCache distributedCache = new MemoryDistributedCache(opts);
            var mockLogger = new Mock<ILogger<CacheService>>();

            var cacheService = new CacheService(distributedCache, mockLogger.Object, null);

            // Act: Increment 3 times
            await cacheService.IncrementAsync("comic_views_count_10", 1);
            await cacheService.IncrementAsync("comic_views_count_10", 1);
            await cacheService.IncrementAsync("comic_views_count_10", 1);

            // Get count and reset
            var count = await cacheService.GetAndResetCountAsync("comic_views_count_10");
            var afterResetCount = await cacheService.GetAsync<long?>("comic_views_count_10");

            // Assert
            Assert.Equal(3, count);
            Assert.Null(afterResetCount);
        }

        [Fact]
        public async Task CacheService_GetOrSetAsync_ExecutesCallbackAndCachesValue()
        {
            // Arrange
            var opts = Options.Create(new MemoryDistributedCacheOptions());
            IDistributedCache distributedCache = new MemoryDistributedCache(opts);
            var mockLogger = new Mock<ILogger<CacheService>>();
            var cacheService = new CacheService(distributedCache, mockLogger.Object, null);

            int executionCount = 0;
            Func<Task<string>> callback = () =>
            {
                executionCount++;
                return Task.FromResult("Cached Result");
            };

            // Act
            var result1 = await cacheService.GetOrSetAsync("test_key", callback, TimeSpan.FromMinutes(5));
            var result2 = await cacheService.GetOrSetAsync("test_key", callback, TimeSpan.FromMinutes(5));

            // Assert
            Assert.Equal("Cached Result", result1);
            Assert.Equal("Cached Result", result2);
            Assert.Equal(1, executionCount);
        }

        [Theory]
        [InlineData("/images/comic1.webp", true)]
        [InlineData("/uploads/chapter1/page1.jpg", true)]
        [InlineData("/api/comics", false)]
        public async Task ImageCacheMiddleware_AppliesCacheHeaderToImagesOnly(string requestPath, bool expectCacheHeader)
        {
            // Arrange
            var context = new DefaultHttpContext();
            context.Request.Path = requestPath;
            context.Response.Body = new MemoryStream();

            RequestDelegate next = (ctx) => Task.CompletedTask;
            var middleware = new ImageCacheMiddleware(next);

            // Act
            await middleware.InvokeAsync(context);
            await context.Response.StartAsync();

            // Assert
            if (expectCacheHeader)
            {
                Assert.True(context.Response.Headers.ContainsKey("Cache-Control"));
                Assert.Equal("public, max-age=31536000, immutable", context.Response.Headers["Cache-Control"].ToString());
            }
            else
            {
                Assert.False(context.Response.Headers.ContainsKey("Cache-Control"));
            }
        }
    }
}
