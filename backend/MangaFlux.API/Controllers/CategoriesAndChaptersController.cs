using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TruyenKomi.API.Services;

namespace TruyenKomi.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CategoriesController : ControllerBase
    {
        private readonly IComicService _comicService;

        public CategoriesController(IComicService comicService)
        {
            _comicService = comicService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool onlyWithComics = false)
        {
            var categories = await _comicService.GetAllCategoriesAsync(onlyWithComics);
            return Ok(categories);
        }
    }

    [ApiController]
    [EnableRateLimiting("chapter-limiter")]
    [Route("api/[controller]")]
    public class ChaptersController : ControllerBase
    {
        private readonly IComicService _comicService;
        private readonly IHttpClientFactory _httpClientFactory;

        public ChaptersController(IComicService comicService, IHttpClientFactory httpClientFactory)
        {
            _comicService = comicService;
            _httpClientFactory = httpClientFactory;
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var chapter = await _comicService.GetChapterByIdAsync(id);
            if (chapter == null) return NotFound(new { message = "Không tìm thấy chương này." });
            return Ok(chapter);
        }

        [HttpGet("{id}/download")]
        [DisableRateLimiting]
        public async Task<IActionResult> DownloadChapter(int id)
        {
            var chapter = await _comicService.GetChapterByIdAsync(id);
            if (chapter == null) return NotFound(new { message = "Không tìm thấy chương này." });
            if (chapter.Pages == null || chapter.Pages.Count == 0)
            {
                return BadRequest(new { message = "Chương này chưa có trang ảnh nào để tải về." });
            }

            var sortedPages = chapter.Pages.OrderBy(p => p.PageNumber).ToList();
            var memoryStream = new MemoryStream();

            try
            {
                using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
                {
                    var httpClient = _httpClientFactory.CreateClient();
                    httpClient.DefaultRequestHeaders.Clear();
                    httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                    httpClient.Timeout = TimeSpan.FromSeconds(45);

                    var throttler = new System.Threading.SemaphoreSlim(16);
                    var downloadTasks = sortedPages.Select(async (page, index) =>
                    {
                        await throttler.WaitAsync();
                        try
                        {
                            var imgUrl = page.ImageUrl;
                            if (string.IsNullOrWhiteSpace(imgUrl)) return null;

                            if (imgUrl.StartsWith("/"))
                            {
                                imgUrl = $"{Request.Scheme}://{Request.Host}{imgUrl}";
                            }

                            if (imgUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
                            {
                                var base64Parts = imgUrl.Split(',');
                                if (base64Parts.Length == 2)
                                {
                                    var bytes = Convert.FromBase64String(base64Parts[1]);
                                    var dataExt = "jpg";
                                    if (imgUrl.Contains("image/png")) dataExt = "png";
                                    else if (imgUrl.Contains("image/webp")) dataExt = "webp";
                                    return new { Index = index + 1, Bytes = bytes, Extension = dataExt };
                                }
                            }

                            var response = await httpClient.GetAsync(imgUrl);
                            if (!response.IsSuccessStatusCode) return null;

                            var imageBytes = await response.Content.ReadAsByteArrayAsync();
                            var ext = "jpg";
                            var match = System.Text.RegularExpressions.Regex.Match(imgUrl, @"\.(jpg|jpeg|png|webp|avif|gif)(?:\?.*)?$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                            if (match.Success)
                            {
                                ext = match.Groups[1].Value.ToLowerInvariant();
                                if (ext == "jpeg") ext = "jpg";
                            }
                            else if (response.Content.Headers.ContentType?.MediaType != null)
                            {
                                var mime = response.Content.Headers.ContentType.MediaType.ToLowerInvariant();
                                if (mime.Contains("png")) ext = "png";
                                else if (mime.Contains("webp")) ext = "webp";
                                else if (mime.Contains("avif")) ext = "avif";
                                else if (mime.Contains("gif")) ext = "gif";
                            }

                            return new { Index = index + 1, Bytes = imageBytes, Extension = ext };
                        }
                        catch
                        {
                            return null;
                        }
                        finally
                        {
                            throttler.Release();
                        }
                    });

                    var results = await Task.WhenAll(downloadTasks);
                    var validResults = results.Where(r => r != null && r.Bytes != null && r.Bytes.Length > 0)
                                              .OrderBy(r => r!.Index)
                                              .ToList();

                    if (validResults.Count == 0)
                    {
                        return StatusCode(502, new { message = "Không thể tải được trang ảnh nào từ máy chủ lưu trữ (vui lòng kiểm tra lại URL ảnh)." });
                    }

                    foreach (var item in validResults)
                    {
                        var entryName = $"{item!.Index:D3}.{item.Extension}";
                        var entry = archive.CreateEntry(entryName, System.IO.Compression.CompressionLevel.Fastest);
                        using var entryStream = entry.Open();
                        await entryStream.WriteAsync(item.Bytes);
                    }
                }

                memoryStream.Seek(0, SeekOrigin.Begin);
                var comicTitle = string.IsNullOrWhiteSpace(chapter.ComicTitle) ? "Comic" : chapter.ComicTitle;
                var safeComicTitle = System.Text.RegularExpressions.Regex.Replace(comicTitle, @"[/\\?%*:|""<>]", "_").Trim();
                var fileName = $"{safeComicTitle} - Chap {chapter.ChapterNumber}.zip";

                Response.Headers["Access-Control-Expose-Headers"] = "Content-Disposition";
                return File(memoryStream.ToArray(), "application/zip", fileName);
            }
            finally
            {
                await memoryStream.DisposeAsync();
            }
        }

        [HttpGet("proxy-image")]
        [DisableRateLimiting]
        public async Task<IActionResult> ProxyImage([FromQuery] string url)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return BadRequest(new { message = "Thiếu URL ảnh cần tải." });
            }

            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || 
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return BadRequest(new { message = "URL ảnh không hợp lệ." });
            }

            try
            {
                var httpClient = _httpClientFactory.CreateClient("ImageProxyClient");

                var request = new HttpRequestMessage(HttpMethod.Get, uri);
                request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
                request.Headers.TryAddWithoutValidation("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8");
                request.Headers.TryAddWithoutValidation("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7");
                
                var host = uri.Host.ToLowerInvariant();
                if (host.Contains("zetimage") || host.Contains("zettruyen"))
                {
                    request.Headers.TryAddWithoutValidation("Referer", "https://www.zettruyen1.com/");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "image");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "no-cors");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");
                }
                else if (host.Contains("viestorage") || host.Contains("vieestorage") || host.Contains("nettruyen"))
                {
                    request.Headers.TryAddWithoutValidation("Referer", "https://nettruyen.africa/");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "image");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "no-cors");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");
                }
                else
                {
                    // Fallback to origin referer to bypass most anti-hotlink checks
                    request.Headers.TryAddWithoutValidation("Referer", $"{uri.Scheme}://{uri.Host}/");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "image");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "no-cors");
                    request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");
                }

                var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode, new { message = "Không thể tải ảnh từ máy chủ nguồn." });
                }

                var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
                var stream = await response.Content.ReadAsStreamAsync();

                Response.Headers["Cache-Control"] = "public, max-age=31536000, s-maxage=31536000, immutable";
                Response.Headers["X-Content-Type-Options"] = "nosniff";
                return File(stream, contentType);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi khi tải ảnh proxy: {ex.Message}" });
            }
        }

        [HttpGet("by-slug/{comicSlug}/chuong-{chapterNumber}")]
        public async Task<IActionResult> GetBySlugAndNumber(string comicSlug, double chapterNumber)
        {
            var chapter = await _comicService.GetChapterBySlugAndNumberAsync(comicSlug, chapterNumber);
            if (chapter == null) return NotFound(new { message = "Không tìm thấy chương này." });
            return Ok(chapter);
        }
    }
}
