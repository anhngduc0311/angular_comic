using System;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace TruyenKomi.API.Middleware
{
    public class AntiScraperMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<AntiScraperMiddleware> _logger;

        // Regex pattern identifying automated scraping tools and vulnerability scanners
        private static readonly Regex SuspiciousUserAgentsRegex = new(
            @"(?i)(scrapy|python-requests|bytespider|sqlmap|nikto|masscan|httpx|aiohttp|urllib|curl\/[0-9]|wget)",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

        public AntiScraperMiddleware(RequestDelegate next, ILogger<AntiScraperMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // 1. Enforce Standard Security Headers
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
            context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
            context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

            var path = context.Request.Path.Value ?? string.Empty;

            // Allow Health checks, metrics, and internal crawler import API to pass without restriction
            if (path.StartsWith("/health", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/metrics", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/api/comics/import-scraped", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/api/comics/fix-dates", StringComparison.OrdinalIgnoreCase) ||
                path.Contains("/sync-metadata", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            var userAgent = context.Request.Headers["User-Agent"].ToString();

            // 2. Check for empty or suspicious User-Agents targeting API endpoints
            if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(userAgent))
                {
                    _logger.LogWarning("[AntiScraper] Blocked request with empty User-Agent to {Path} from IP {IP}", path, context.Connection.RemoteIpAddress);
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync("{\"status\":403,\"error\":\"Forbidden\",\"message\":\"Yêu cầu bị từ chối do thiếu User-Agent hợp lệ.\"}");
                    return;
                }

                if (SuspiciousUserAgentsRegex.IsMatch(userAgent))
                {
                    _logger.LogWarning("[AntiScraper] Blocked scraper bot User-Agent '{UserAgent}' to {Path} from IP {IP}", userAgent, path, context.Connection.RemoteIpAddress);
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync("{\"status\":403,\"error\":\"Forbidden\",\"message\":\"Yêu cầu bị chặn do phát hiện công cụ cào dữ liệu tự động.\"}");
                    return;
                }
            }

            await _next(context);
        }
    }
}
