using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using TruyenKomi.API.Services;
using TruyenKomi.API.Services.HealthChecks;
using Xunit;

namespace TruyenKomi.Tests
{
    public class HealthAndMetricsTests
    {
        [Fact]
        public void MangaMetrics_StaticDefinitions_AreInitialized()
        {
            // Assert custom metrics counters & gauges are created
            Assert.NotNull(TruyenKomi.API.Services.MangaMetrics.CacheHitsTotal);
            Assert.NotNull(TruyenKomi.API.Services.MangaMetrics.CacheMissesTotal);
            Assert.NotNull(TruyenKomi.API.Services.MangaMetrics.ChapterViewsIncrementedTotal);
            Assert.NotNull(TruyenKomi.API.Services.MangaMetrics.ChapterViewsSyncedTotal);
            Assert.NotNull(TruyenKomi.API.Services.MangaMetrics.DbSyncDurationSeconds);
            Assert.NotNull(TruyenKomi.API.Services.MangaMetrics.RedisConnectedGauge);

            // Test counter operations
            TruyenKomi.API.Services.MangaMetrics.CacheHitsTotal.WithLabels("test_chapter").Inc();
            TruyenKomi.API.Services.MangaMetrics.CacheMissesTotal.WithLabels("test_chapter").Inc();
            TruyenKomi.API.Services.MangaMetrics.ChapterViewsIncrementedTotal.WithLabels("comic").Inc(5);
            TruyenKomi.API.Services.MangaMetrics.RedisConnectedGauge.Set(1);

            Assert.True(true);
        }

        [Fact]
        public async Task RedisHealthCheck_WhenNullConnection_ReturnsDegraded()
        {
            var healthCheck = new RedisHealthCheck(null);
            var context = new HealthCheckContext();

            var result = await healthCheck.CheckHealthAsync(context, CancellationToken.None);

            Assert.Equal(HealthStatus.Degraded, result.Status);
            Assert.Contains("fallback", result.Description, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public async Task StorageHealthCheck_WhenServiceAvailable_ReturnsHealthy()
        {
            var mockStorage = new Moq.Mock<IStorageService>();
            var healthCheck = new StorageHealthCheck(mockStorage.Object);
            var context = new HealthCheckContext();

            var result = await healthCheck.CheckHealthAsync(context, CancellationToken.None);

            Assert.Equal(HealthStatus.Healthy, result.Status);
        }
    }
}
