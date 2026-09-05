using Prometheus;

namespace TruyenKomi.API.Services
{
    public static class MangaMetrics
    {
        public static readonly Counter CacheHitsTotal = Metrics.CreateCounter(
            "truyenkomi_cache_hits_total",
            "Total number of cache hits in Redis",
            new CounterConfiguration
            {
                LabelNames = new[] { "key_prefix" }
            });

        public static readonly Counter CacheMissesTotal = Metrics.CreateCounter(
            "truyenkomi_cache_misses_total",
            "Total number of cache misses in Redis",
            new CounterConfiguration
            {
                LabelNames = new[] { "key_prefix" }
            });

        public static readonly Counter ChapterViewsIncrementedTotal = Metrics.CreateCounter(
            "truyenkomi_chapter_views_incremented_total",
            "Total chapter view count increments recorded in Redis",
            new CounterConfiguration
            {
                LabelNames = new[] { "type" }
            });

        public static readonly Counter ChapterViewsSyncedTotal = Metrics.CreateCounter(
            "truyenkomi_chapter_views_synced_total",
            "Total views synced from Redis to SQL Server in background worker");

        public static readonly Histogram DbSyncDurationSeconds = Metrics.CreateHistogram(
            "truyenkomi_db_views_sync_duration_seconds",
            "Histogram of duration taken by ViewSyncWorker to batch update SQL Server views",
            new HistogramConfiguration
            {
                Buckets = Histogram.ExponentialBuckets(start: 0.005, factor: 2, count: 10)
            });

        public static readonly Gauge RedisConnectedGauge = Metrics.CreateGauge(
            "truyenkomi_redis_connected",
            "Status of Redis connection (1 = connected, 0 = disconnected)");
    }
}
