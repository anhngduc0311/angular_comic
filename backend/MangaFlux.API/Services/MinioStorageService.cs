using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Minio;
using Minio.DataModel.Args;

namespace TruyenKomi.API.Services
{
    public interface IStorageService
    {
        Task<string> UploadFileAsync(IFormFile file, string? folder = "general");
        Task<List<string>> UploadFilesAsync(List<IFormFile> files, string? folder = "chapters");
        Task<(Stream Stream, string ContentType)> GetFileStreamAsync(string fileName);
    }

    public class MinioStorageService : IStorageService
    {
        private readonly IMinioClient _primaryClient;
        private readonly IMinioClient? _secondaryClient;
        private readonly string _primaryBucket;
        private readonly string _secondaryBucket;
        private readonly string _primaryCdnUrl;
        private readonly string _secondaryCdnUrl;
        private readonly ILogger<MinioStorageService> _logger;

        private readonly HashSet<string> _ensuredBuckets = new();

        public MinioStorageService(IConfiguration config, ILogger<MinioStorageService> logger)
        {
            _logger = logger;

            // Prioritize Cloudflare R2 if configured via CF_R2_* environment variables
            var isCloudflareR2 = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("CF_R2_ENDPOINT"));
            
            var endpoint = (isCloudflareR2 ? Environment.GetEnvironmentVariable("CF_R2_ENDPOINT") : null)
                ?? Environment.GetEnvironmentVariable("R2_ENDPOINT") 
                ?? config["Minio:Endpoint"] 
                ?? "localhost:9000";

            // Clean endpoint string (remove https://, http://, and trailing slash)
            endpoint = endpoint.Replace("https://", "").Replace("http://", "").Trim().TrimEnd('/');

            var accessKey = (isCloudflareR2 ? Environment.GetEnvironmentVariable("CF_R2_ACCESS_KEY") : null)
                ?? Environment.GetEnvironmentVariable("R2_ACCESS_KEY") 
                ?? config["Minio:AccessKey"] 
                ?? "truyenkomi_admin";

            var secretKey = (isCloudflareR2 ? Environment.GetEnvironmentVariable("CF_R2_SECRET_KEY") : null)
                ?? Environment.GetEnvironmentVariable("R2_SECRET_KEY") 
                ?? config["Minio:SecretKey"] 
                ?? "TruyenKomiSecretPassword2026!";

            _primaryBucket = (isCloudflareR2 ? Environment.GetEnvironmentVariable("CF_R2_BUCKET") : null)
                ?? Environment.GetEnvironmentVariable("R2_BUCKET_NAME") 
                ?? config["Minio:BucketName"] 
                ?? "comics";

            _primaryCdnUrl = Environment.GetEnvironmentVariable("CF_R2_CDN_URL")
                ?? Environment.GetEnvironmentVariable("CF_R2_PUBLIC_URL")
                ?? Environment.GetEnvironmentVariable("R2_CDN_BASE_URL") 
                ?? config["Minio:CdnBaseUrl"] 
                ?? "https://img.truyenkomi.site";

            var secureStr = Environment.GetEnvironmentVariable("R2_SECURE") ?? config["Minio:Secure"];
            var secure = (bool.TryParse(secureStr, out var s) && s) || endpoint.Contains(".r2.cloudflarestorage.com") || endpoint.Contains(".googleapis.com");

            _logger.LogInformation($"Storage Service initialized. Endpoint: {endpoint}, Bucket: {_primaryBucket}, Secure: {secure}, CDN: {_primaryCdnUrl}");

            _primaryClient = new MinioClient()
                .WithEndpoint(endpoint)
                .WithCredentials(accessKey, secretKey)
                .WithSSL(secure)
                .Build();

            // Secondary Provider (Backblaze B2 S3 Compatible)
            var secEndpoint = Environment.GetEnvironmentVariable("B2_ENDPOINT") ?? config["Minio:Secondary:Endpoint"];
            if (!string.IsNullOrEmpty(secEndpoint))
            {
                secEndpoint = secEndpoint.Replace("https://", "").Replace("http://", "").Trim().TrimEnd('/');
                var secAccessKey = Environment.GetEnvironmentVariable("B2_ACCESS_KEY") ?? config["Minio:Secondary:AccessKey"] ?? "";
                var secSecretKey = Environment.GetEnvironmentVariable("B2_SECRET_KEY") ?? config["Minio:Secondary:SecretKey"] ?? "";
                _secondaryBucket = Environment.GetEnvironmentVariable("B2_BUCKET_NAME") ?? config["Minio:Secondary:BucketName"] ?? "truyenkomi-b2";
                _secondaryCdnUrl = Environment.GetEnvironmentVariable("B2_CDN_BASE_URL") ?? config["Minio:Secondary:CdnBaseUrl"] ?? ("https://f005.backblazeb2.com/file/" + _secondaryBucket);
                var secSecureStr = Environment.GetEnvironmentVariable("B2_SECURE") ?? config["Minio:Secondary:Secure"];
                var secSecure = !bool.TryParse(secSecureStr, out var ss) || ss;

                _secondaryClient = new MinioClient()
                    .WithEndpoint(secEndpoint)
                    .WithCredentials(secAccessKey, secSecretKey)
                    .WithSSL(secSecure)
                    .Build();
            }
            else
            {
                _secondaryBucket = "";
                _secondaryCdnUrl = "";
            }
        }

        private async Task EnsureBucketExistsAsync(IMinioClient client, string bucketName)
        {
            if (_ensuredBuckets.Contains(bucketName)) return;

            try
            {
                var beArgs = new BucketExistsArgs().WithBucket(bucketName);
                bool found = await client.BucketExistsAsync(beArgs);
                if (!found)
                {
                    var mbArgs = new MakeBucketArgs().WithBucket(bucketName);
                    await client.MakeBucketAsync(mbArgs);
                }

                // Cloudflare R2 manages public access via Custom Domains or Dashboard rules, skip SetPolicyAsync for R2
                var isR2 = Environment.GetEnvironmentVariable("CF_R2_ENDPOINT") != null || 
                           (Environment.GetEnvironmentVariable("R2_ENDPOINT")?.Contains(".r2.cloudflarestorage.com") == true);

                if (!isR2)
                {
                    // Set Anonymous Public Read Policy for standard MinIO/S3
                    string policy = $@"{{
                        ""Version"": ""2012-10-17"",
                        ""Statement"": [
                            {{
                                ""Effect"": ""Allow"",
                                ""Principal"": {{""AWS"": [""*""]}},
                                ""Action"": [""s3:GetObject""],
                                ""Resource"": [""arn:aws:s3:::{bucketName}/*""]
                            }}
                        ]
                    }}";

                    var spArgs = new SetPolicyArgs().WithBucket(bucketName).WithPolicy(policy);
                    await client.SetPolicyAsync(spArgs);
                }

                _ensuredBuckets.Add(bucketName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Bucket '{bucketName}' Setup Notice: {ex.Message}");
                // Still mark as checked so we don't spam exceptions on every upload
                _ensuredBuckets.Add(bucketName);
            }
        }

        public async Task<string> UploadFileAsync(IFormFile file, string? folder = "general")
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("File upload không hợp lệ.");

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (string.IsNullOrEmpty(ext)) ext = ".jpg";
            var fileName = $"{folder}/{Guid.NewGuid():N}{ext}";

            try
            {
                await EnsureBucketExistsAsync(_primaryClient, _primaryBucket);

                using var stream = file.OpenReadStream();
                var contentType = file.ContentType;
                if (string.IsNullOrEmpty(contentType) || contentType == "application/octet-stream")
                {
                    contentType = ext switch
                    {
                        ".png" => "image/png",
                        ".webp" => "image/webp",
                        ".gif" => "image/gif",
                        ".avif" => "image/avif",
                        _ => "image/jpeg"
                    };
                }

                var putObjectArgs = new PutObjectArgs()
                    .WithBucket(_primaryBucket)
                    .WithObject(fileName)
                    .WithStreamData(stream)
                    .WithObjectSize(stream.Length)
                    .WithContentType(contentType);

                await _primaryClient.PutObjectAsync(putObjectArgs);

                var baseUrl = _primaryCdnUrl.TrimEnd('/');
                if (baseUrl.EndsWith("/" + _primaryBucket) || baseUrl.StartsWith("https://") || baseUrl.StartsWith("http://"))
                {
                    return $"{baseUrl}/{fileName}";
                }
                return $"{baseUrl}/{_primaryBucket}/{fileName}";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Primary storage upload failed. Attempting fallback to Secondary Storage...");

                if (_secondaryClient != null)
                {
                    await EnsureBucketExistsAsync(_secondaryClient, _secondaryBucket);

                    using var stream = file.OpenReadStream();
                    var putObjectArgs = new PutObjectArgs()
                        .WithBucket(_secondaryBucket)
                        .WithObject(fileName)
                        .WithStreamData(stream)
                        .WithObjectSize(stream.Length)
                        .WithContentType(file.ContentType);

                    await _secondaryClient.PutObjectAsync(putObjectArgs);

                    var secBaseUrl = _secondaryCdnUrl.TrimEnd('/');
                    return $"{secBaseUrl}/{fileName}";
                }

                throw;
            }
        }

        public async Task<List<string>> UploadFilesAsync(List<IFormFile> files, string? folder = "chapters")
        {
            var urls = new List<string>();
            foreach (var file in files)
            {
                if (file.Length > 0)
                {
                    var url = await UploadFileAsync(file, folder);
                    urls.Add(url);
                }
            }
            return urls;
        }

        public async Task<(Stream Stream, string ContentType)> GetFileStreamAsync(string fileName)
        {
            var memoryStream = new MemoryStream();
            var ext = Path.GetExtension(fileName).ToLowerInvariant();
            var contentType = ext switch
            {
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".gif" => "image/gif",
                ".avif" => "image/avif",
                _ => "image/jpeg"
            };

            try
            {
                var getArgs = new GetObjectArgs()
                    .WithBucket(_primaryBucket)
                    .WithObject(fileName)
                    .WithCallbackStream(stream =>
                    {
                        stream.CopyTo(memoryStream);
                    });

                await _primaryClient.GetObjectAsync(getArgs);
                memoryStream.Position = 0;
                return (memoryStream, contentType);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Không thể lấy file '{fileName}' từ storage chính: {ex.Message}");

                if (_secondaryClient != null)
                {
                    var secGetArgs = new GetObjectArgs()
                        .WithBucket(_secondaryBucket)
                        .WithObject(fileName)
                        .WithCallbackStream(stream =>
                        {
                            stream.CopyTo(memoryStream);
                        });

                    await _secondaryClient.GetObjectAsync(secGetArgs);
                    memoryStream.Position = 0;
                    return (memoryStream, contentType);
                }

                throw;
            }
        }
    }
}

