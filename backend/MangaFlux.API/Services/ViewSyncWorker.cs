using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TruyenKomi.API.Data;
using Prometheus;

namespace TruyenKomi.API.Services
{
    public class ViewSyncWorker : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<ViewSyncWorker> _logger;
        private readonly TimeSpan _syncInterval = TimeSpan.FromMinutes(3);

        public ViewSyncWorker(IServiceProvider serviceProvider, ILogger<ViewSyncWorker> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("ViewSyncWorker started. Syncing views every {Interval} minutes.", _syncInterval.TotalMinutes);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(_syncInterval, stoppingToken);
                    await SyncViewsToDatabaseAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred while syncing views from Redis to SQL Server.");
                }
            }

            _logger.LogInformation("ViewSyncWorker stopped.");
        }

        private async Task SyncViewsToDatabaseAsync(CancellationToken cancellationToken)
        {
            using var timer = MangaMetrics.DbSyncDurationSeconds.NewTimer();
            using var scope = _serviceProvider.CreateScope();
            var cacheService = scope.ServiceProvider.GetRequiredService<ICacheService>();
            var dbContext = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

            // Sync Comic Views
            var comicKeys = await cacheService.GetKeysAsync("*comic_views_count_*");
            int comicSyncCount = 0;
            long totalViewsSynced = 0;

            foreach (var key in comicKeys)
            {
                var lastUnderscore = key.LastIndexOf('_');
                if (lastUnderscore >= 0 && int.TryParse(key.Substring(lastUnderscore + 1), out int comicId))
                {
                    long delta = await cacheService.GetAndResetCountAsync(key);
                    if (delta > 0)
                    {
                        await dbContext.Comics
                            .Where(c => c.Id == comicId)
                            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Views, c => c.Views + (int)delta), cancellationToken);
                        comicSyncCount++;
                        totalViewsSynced += delta;
                    }
                }
            }

            // Sync Chapter Views
            var chapterKeys = await cacheService.GetKeysAsync("*chapter_views_count_*");
            int chapterSyncCount = 0;

            foreach (var key in chapterKeys)
            {
                var lastUnderscore = key.LastIndexOf('_');
                if (lastUnderscore >= 0 && int.TryParse(key.Substring(lastUnderscore + 1), out int chapterId))
                {
                    long delta = await cacheService.GetAndResetCountAsync(key);
                    if (delta > 0)
                    {
                        await dbContext.Chapters
                            .Where(ch => ch.Id == chapterId)
                            .ExecuteUpdateAsync(s => s.SetProperty(ch => ch.Views, ch => ch.Views + (int)delta), cancellationToken);
                        chapterSyncCount++;
                        totalViewsSynced += delta;
                    }
                }
            }

            if (totalViewsSynced > 0)
            {
                MangaMetrics.ChapterViewsSyncedTotal.Inc(totalViewsSynced);
            }

            if (comicSyncCount > 0 || chapterSyncCount > 0)
            {
                _logger.LogInformation("[ViewSyncWorker] Batch synced {ComicCount} comics and {ChapterCount} chapters ({TotalViews} views) to SQL Server.", comicSyncCount, chapterSyncCount, totalViewsSynced);
            }
        }
    }
}
