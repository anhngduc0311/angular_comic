using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using TruyenKomi.API.Middleware;
using Xunit;

namespace TruyenKomi.Tests
{
    public class SecurityAndAuthTests
    {
        [Fact]
        public async Task AntiScraperMiddleware_SetsSecurityHeaders()
        {
            var middleware = new AntiScraperMiddleware(
                (innerHttpContext) => Task.CompletedTask,
                NullLogger<AntiScraperMiddleware>.Instance);

            var context = new DefaultHttpContext();
            context.Request.Path = "/api/categories";
            context.Request.Headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

            await middleware.InvokeAsync(context);

            Assert.Equal("nosniff", context.Response.Headers["X-Content-Type-Options"]);
            Assert.Equal("SAMEORIGIN", context.Response.Headers["X-Frame-Options"]);
            Assert.Equal("1; mode=block", context.Response.Headers["X-XSS-Protection"]);
            Assert.Equal("no-referrer", context.Response.Headers["Referrer-Policy"]);
        }

        [Theory]
        [InlineData("scrapy/2.5")]
        [InlineData("python-requests/2.28.1")]
        [InlineData("bytespider")]
        [InlineData("sqlmap/1.6#stable")]
        [InlineData("Wget/1.21.3")]
        [InlineData("curl/7.88.1")]
        public async Task AntiScraperMiddleware_BlocksSuspiciousScraperBots(string badUserAgent)
        {
            var nextCalled = false;
            var middleware = new AntiScraperMiddleware(
                (innerHttpContext) =>
                {
                    nextCalled = true;
                    return Task.CompletedTask;
                },
                NullLogger<AntiScraperMiddleware>.Instance);

            var context = new DefaultHttpContext();
            context.Response.Body = new MemoryStream();
            context.Request.Path = "/api/chapters/by-slug/test/chuong-1";
            context.Request.Headers["User-Agent"] = badUserAgent;

            await middleware.InvokeAsync(context);

            Assert.False(nextCalled);
            Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        }

        [Fact]
        public async Task AntiScraperMiddleware_BlocksEmptyUserAgentOnApi()
        {
            var nextCalled = false;
            var middleware = new AntiScraperMiddleware(
                (innerHttpContext) =>
                {
                    nextCalled = true;
                    return Task.CompletedTask;
                },
                NullLogger<AntiScraperMiddleware>.Instance);

            var context = new DefaultHttpContext();
            context.Response.Body = new MemoryStream();
            context.Request.Path = "/api/comics";
            context.Request.Headers["User-Agent"] = "";

            await middleware.InvokeAsync(context);

            Assert.False(nextCalled);
            Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        }

        [Fact]
        public async Task AntiScraperMiddleware_AllowsLegitimateBrowserUserAgent()
        {
            var nextCalled = false;
            var middleware = new AntiScraperMiddleware(
                (innerHttpContext) =>
                {
                    nextCalled = true;
                    return Task.CompletedTask;
                },
                NullLogger<AntiScraperMiddleware>.Instance);

            var context = new DefaultHttpContext();
            context.Request.Path = "/api/comics/featured";
            context.Request.Headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36";

            await middleware.InvokeAsync(context);

            Assert.True(nextCalled);
            Assert.NotEqual(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        }
    }
}
