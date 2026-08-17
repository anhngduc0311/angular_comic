using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using MangaFlux.API.Services;
using MangaFlux.API.Services.HealthChecks;
using Xunit;

namespace MangaFlux.Tests
{
    public class HealthAndMetricsTests
    {
        [Fact]
        public void MangaMetrics_StaticDefinitions_AreInitialized()
        {
            // Assert custom metrics counters & gauges are created
            Assert.NotNull(MangaFlux.API.Services.MangaMetrics.CacheHitsTotal);
            Assert.NotNull(MangaFlux.API.Services.MangaMetrics.CacheMissesTotal);
            Assert.NotNull(MangaFlux.API.Services.MangaMetrics.ChapterViewsIncrementedTotal);
            Assert.NotNull(MangaFlux.API.Services.MangaMetrics.ChapterViewsSyncedTotal);
            Assert.NotNull(MangaFlux.API.Services.MangaMetrics.DbSyncDurationSeconds);
            Assert.NotNull(MangaFlux.API.Services.MangaMetrics.RedisConnectedGauge);

            // Test counter operations
            MangaFlux.API.Services.MangaMetrics.CacheHitsTotal.WithLabels("test_chapter").Inc();
            MangaFlux.API.Services.MangaMetrics.CacheMissesTotal.WithLabels("test_chapter").Inc();
            MangaFlux.API.Services.MangaMetrics.ChapterViewsIncrementedTotal.WithLabels("comic").Inc(5);
            MangaFlux.API.Services.MangaMetrics.RedisConnectedGauge.Set(1);

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
