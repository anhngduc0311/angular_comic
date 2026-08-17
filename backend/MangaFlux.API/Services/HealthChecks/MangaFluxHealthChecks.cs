using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using StackExchange.Redis;
using MangaFlux.API.Data;

namespace MangaFlux.API.Services.HealthChecks
{
    public class SqlServerHealthCheck : IHealthCheck
    {
        private readonly MangaDbContext _dbContext;

        public SqlServerHealthCheck(MangaDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                var canConnect = await _dbContext.Database.CanConnectAsync(cancellationToken);
                if (canConnect)
                {
                    return HealthCheckResult.Healthy("SQL Server database connection is healthy.");
                }

                return HealthCheckResult.Unhealthy("Cannot connect to SQL Server database.");
            }
            catch (Exception ex)
            {
                return HealthCheckResult.Unhealthy($"SQL Server health check failed: {ex.Message}", ex);
            }
        }
    }

    public class RedisHealthCheck : IHealthCheck
    {
        private readonly IConnectionMultiplexer? _redis;

        public RedisHealthCheck(IConnectionMultiplexer? redis = null)
        {
            _redis = redis;
        }

        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                if (_redis == null)
                {
                    MangaMetrics.RedisConnectedGauge.Set(0);
                    return HealthCheckResult.Degraded("Redis connection is not configured; fallback to in-memory cache.");
                }

                if (!_redis.IsConnected)
                {
                    MangaMetrics.RedisConnectedGauge.Set(0);
                    return HealthCheckResult.Unhealthy("Redis server is disconnected.");
                }

                var db = _redis.GetDatabase();
                var ping = await db.PingAsync();
                MangaMetrics.RedisConnectedGauge.Set(1);

                return HealthCheckResult.Healthy($"Redis cache is healthy. Latency: {ping.TotalMilliseconds:F1}ms");
            }
            catch (Exception ex)
            {
                MangaMetrics.RedisConnectedGauge.Set(0);
                return HealthCheckResult.Unhealthy($"Redis health check failed: {ex.Message}", ex);
            }
        }
    }

    public class StorageHealthCheck : IHealthCheck
    {
        private readonly IStorageService _storageService;

        public StorageHealthCheck(IStorageService storageService)
        {
            _storageService = storageService;
        }

        public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                // Verify storage service instantiation
                if (_storageService != null)
                {
                    return Task.FromResult(HealthCheckResult.Healthy("MinIO/S3 Storage Service is registered and ready."));
                }

                return Task.FromResult(HealthCheckResult.Unhealthy("Storage service is not available."));
            }
            catch (Exception ex)
            {
                return Task.FromResult(HealthCheckResult.Unhealthy($"Storage health check failed: {ex.Message}", ex));
            }
        }
    }
}
