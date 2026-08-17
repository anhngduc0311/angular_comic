using System;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaFlux.API.Data;

namespace MangaFlux.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SeoController : ControllerBase
    {
        private readonly MangaDbContext _context;

        public SeoController(MangaDbContext context)
        {
            _context = context;
        }

        [HttpGet("sitemap.xml")]
        [Produces("application/xml")]
        public async Task<IActionResult> GetSitemapXml()
        {
            var host = Request.Host.Value;
            var scheme = Request.Scheme;
            var baseUrl = $"{scheme}://{host}";

            var comics = await _context.Comics
                .AsNoTracking()
                .Where(c => c.IsPublic)
                .Select(c => new
                {
                    c.Slug,
                    c.UpdatedAt,
                    Chapters = c.Chapters
                        .Where(ch => ch.IsPublic)
                        .Select(ch => new { ch.ChapterNumber, ch.CreatedAt })
                        .ToList()
                })
                .ToListAsync();

            var categories = await _context.Categories
                .AsNoTracking()
                .Select(cat => cat.Slug)
                .ToListAsync();

            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            var urlset = new XElement(ns + "urlset");

            // Static Pages
            urlset.Add(new XElement(ns + "url",
                new XElement(ns + "loc", $"{baseUrl}/"),
                new XElement(ns + "changefreq", "daily"),
                new XElement(ns + "priority", "1.0")
            ));

            urlset.Add(new XElement(ns + "url",
                new XElement(ns + "loc", $"{baseUrl}/comics"),
                new XElement(ns + "changefreq", "daily"),
                new XElement(ns + "priority", "0.9")
            ));

            urlset.Add(new XElement(ns + "url",
                new XElement(ns + "loc", $"{baseUrl}/categories"),
                new XElement(ns + "changefreq", "weekly"),
                new XElement(ns + "priority", "0.8")
            ));

            // Categories
            foreach (var catSlug in categories)
            {
                urlset.Add(new XElement(ns + "url",
                    new XElement(ns + "loc", $"{baseUrl}/comics?category={catSlug}"),
                    new XElement(ns + "changefreq", "weekly"),
                    new XElement(ns + "priority", "0.7")
                ));
            }

            // Comics & Chapters
            foreach (var comic in comics)
            {
                urlset.Add(new XElement(ns + "url",
                    new XElement(ns + "loc", $"{baseUrl}/comic/{comic.Slug}"),
                    new XElement(ns + "lastmod", comic.UpdatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ")),
                    new XElement(ns + "changefreq", "daily"),
                    new XElement(ns + "priority", "0.85")
                ));

                foreach (var chapter in comic.Chapters)
                {
                    urlset.Add(new XElement(ns + "url",
                        new XElement(ns + "loc", $"{baseUrl}/read/{comic.Slug}/chuong-{chapter.ChapterNumber}"),
                        new XElement(ns + "lastmod", chapter.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ")),
                        new XElement(ns + "changefreq", "monthly"),
                        new XElement(ns + "priority", "0.6")
                    ));
                }
            }

            var doc = new XDocument(new XDeclaration("1.0", "utf-8", "yes"), urlset);
            return Content(doc.ToString(), "application/xml", Encoding.UTF8);
        }

        [HttpGet("robots.txt")]
        [Produces("text/plain")]
        public IActionResult GetRobotsTxt()
        {
            var host = Request.Host.Value;
            var scheme = Request.Scheme;
            var baseUrl = $"{scheme}://{host}";

            var sb = new StringBuilder();
            sb.AppendLine("User-agent: *");
            sb.AppendLine("Allow: /");
            sb.AppendLine("Disallow: /admin");
            sb.AppendLine("Disallow: /profile");
            sb.AppendLine("Disallow: /settings");
            sb.AppendLine("Disallow: /api/");
            sb.AppendLine($"Sitemap: {baseUrl}/sitemap.xml");

            return Content(sb.ToString(), "text/plain", Encoding.UTF8);
        }
    }
}
