using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Minio;
using Minio.DataModel.Args;

namespace MangaFlux.API.Services
{
    public interface IStorageService
    {
        Task<string> UploadFileAsync(IFormFile file, string? folder = "general");
        Task<List<string>> UploadFilesAsync(List<IFormFile> files, string? folder = "chapters");
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

        public MinioStorageService(IConfiguration config, ILogger<MinioStorageService> logger)
        {
            _logger = logger;

            // Primary Provider (Cloudflare R2 or MinIO)
            var endpoint = config["Minio:Endpoint"] ?? "localhost:9000";
            var accessKey = config["Minio:AccessKey"] ?? "mangaflux_admin";
            var secretKey = config["Minio:SecretKey"] ?? "MangaFluxSecretPassword2026!";
            _primaryBucket = config["Minio:BucketName"] ?? "comics";
            _primaryCdnUrl = config["Minio:CdnBaseUrl"] ?? "https://hypermmo.site";
            var secure = bool.TryParse(config["Minio:Secure"], out var s) && s;

            _primaryClient = new MinioClient()
                .WithEndpoint(endpoint)
                .WithCredentials(accessKey, secretKey)
                .WithSSL(secure)
                .Build();

            // Secondary Provider (Backblaze B2 S3 Compatible - Free 10GB + Cloudflare Bandwidth Alliance)
            var secEndpoint = config["Minio:Secondary:Endpoint"];
            if (!string.IsNullOrEmpty(secEndpoint))
            {
                var secAccessKey = config["Minio:Secondary:AccessKey"] ?? "";
                var secSecretKey = config["Minio:Secondary:SecretKey"] ?? "";
                _secondaryBucket = config["Minio:Secondary:BucketName"] ?? "comics-b2";
                _secondaryCdnUrl = config["Minio:Secondary:CdnBaseUrl"] ?? ("https://cdn.mangaflux.com/" + _secondaryBucket);
                var secSecure = !bool.TryParse(config["Minio:Secondary:Secure"], out var ss) || ss;

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
            try
            {
                var beArgs = new BucketExistsArgs().WithBucket(bucketName);
                bool found = await client.BucketExistsAsync(beArgs);
                if (!found)
                {
                    var mbArgs = new MakeBucketArgs().WithBucket(bucketName);
                    await client.MakeBucketAsync(mbArgs);
                }

                // Set Anonymous Public Read Policy for the bucket
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
            catch (Exception ex)
            {
                _logger.LogWarning($"Bucket '{bucketName}' Setup/Policy Notice: {ex.Message}");
            }
        }

        public async Task<string> UploadFileAsync(IFormFile file, string? folder = "general")
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("File upload không hợp lệ.");

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var fileName = $"{folder}/{Guid.NewGuid():N}{ext}";

            try
            {
                await EnsureBucketExistsAsync(_primaryClient, _primaryBucket);

                using var stream = file.OpenReadStream();
                var putObjectArgs = new PutObjectArgs()
                    .WithBucket(_primaryBucket)
                    .WithObject(fileName)
                    .WithStreamData(stream)
                    .WithObjectSize(stream.Length)
                    .WithContentType(file.ContentType);

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
                _logger.LogWarning(ex, "Primary storage upload failed or full. Attempting fallback to Secondary Storage (Backblaze B2)...");

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
    }
}

