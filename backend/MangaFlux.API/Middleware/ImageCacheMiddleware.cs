using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace TruyenKomi.API.Middleware
{
    public class ImageCacheMiddleware
    {
        private readonly RequestDelegate _next;

        public ImageCacheMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value?.ToLowerInvariant();
            if (!string.IsNullOrEmpty(path) &&
                (path.Contains("/images/") || path.Contains("/uploads/") ||
                 path.EndsWith(".webp") || path.EndsWith(".jpg") ||
                 path.EndsWith(".jpeg") || path.EndsWith(".png") ||
                 path.EndsWith(".avif")))
            {
                context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            }

            await _next(context);
        }
    }
}

