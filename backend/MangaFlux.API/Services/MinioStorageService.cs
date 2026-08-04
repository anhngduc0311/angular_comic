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
        private readonly IMinioClient _minioClient;
        private readonly string _bucketName;
        private readonly string _endpoint;
        private readonly ILogger<MinioStorageService> _logger;

        public MinioStorageService(IConfiguration config, ILogger<MinioStorageService> logger)
        {
            _logger = logger;
            _endpoint = config["Minio:Endpoint"] ?? "localhost:9000";
            var accessKey = config["Minio:AccessKey"] ?? "mangaflux_admin";
            var secretKey = config["Minio:SecretKey"] ?? "MangaFluxSecretPassword2026!";
            _bucketName = config["Minio:BucketName"] ?? "comics";
            var secure = bool.TryParse(config["Minio:Secure"], out var s) && s;

            _minioClient = new MinioClient()
                .WithEndpoint(_endpoint)
                .WithCredentials(accessKey, secretKey)
                .WithSSL(secure)
                .Build();
        }

        private async Task EnsureBucketExistsAsync()
        {
            try
            {
                var beArgs = new BucketExistsArgs().WithBucket(_bucketName);
                bool found = await _minioClient.BucketExistsAsync(beArgs);
                if (!found)
                {
                    var mbArgs = new MakeBucketArgs().WithBucket(_bucketName);
                    await _minioClient.MakeBucketAsync(mbArgs);
                }

                // Set Anonymous Public Read Policy for the bucket
                string policy = $@"{{
                    ""Version"": ""2012-10-17"",
                    ""Statement"": [
                        {{
                            ""Effect"": ""Allow"",
                            ""Principal"": {{""AWS"": [""*""]}},
                            ""Action"": [""s3:GetObject""],
                            ""Resource"": [""arn:aws:s3:::{_bucketName}/*""]
                        }}
                    ]
                }}";

                var spArgs = new SetPolicyArgs().WithBucket(_bucketName).WithPolicy(policy);
                await _minioClient.SetPolicyAsync(spArgs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"MinIO Bucket Setup Error: {ex.Message}");
            }
        }

        public async Task<string> UploadFileAsync(IFormFile file, string? folder = "general")
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("File upload không hợp lệ.");

            await EnsureBucketExistsAsync();

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var fileName = $"{folder}/{Guid.NewGuid():N}{ext}";

            using var stream = file.OpenReadStream();
            var putObjectArgs = new PutObjectArgs()
                .WithBucket(_bucketName)
                .WithObject(fileName)
                .WithStreamData(stream)
                .WithObjectSize(stream.Length)
                .WithContentType(file.ContentType);

            await _minioClient.PutObjectAsync(putObjectArgs);

            return $"http://{_endpoint}/{_bucketName}/{fileName}";
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
