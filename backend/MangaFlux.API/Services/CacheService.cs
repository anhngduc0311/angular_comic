using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace TruyenKomi.API.Services
{
    public interface ICacheService
    {
        Task<T?> GetAsync<T>(string key);
        Task SetAsync<T>(string key, T value, TimeSpan? absoluteExpireTime = null);
        Task RemoveAsync(string key);
        Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> getItemCallback, TimeSpan? absoluteExpireTime = null);
        Task RemoveByPatternAsync(string pattern);
        Task<long> IncrementAsync(string key, long value = 1);
        Task<List<string>> GetKeysAsync(string pattern);
        Task<long> GetAndResetCountAsync(string key);
    }

    public class CacheService : ICacheService
    {
        private readonly IDistributedCache _cache;
        private readonly IConnectionMultiplexer? _redisConnection;
        private readonly ILogger<CacheService> _logger;

        public CacheService(IDistributedCache cache, ILogger<CacheService> logger, IConnectionMultiplexer? redisConnection = null)
        {
            _cache = cache;
            _logger = logger;
            _redisConnection = redisConnection;
        }

        private static string ExtractKeyPrefix(string key)
        {
            var colonIndex = key.IndexOf(':');
            return colonIndex > 0 ? key.Substring(0, colonIndex) : (key.Length > 15 ? key.Substring(0, 15) : key);
        }

        public async Task<T?> GetAsync<T>(string key)
        {
            try
            {
                var cachedData = await _cache.GetStringAsync(key);
                var prefix = ExtractKeyPrefix(key);

                if (string.IsNullOrEmpty(cachedData))
                {
                    MangaMetrics.CacheMissesTotal.WithLabels(prefix).Inc();
                    return default;
                }

                MangaMetrics.CacheHitsTotal.WithLabels(prefix).Inc();
                return JsonSerializer.Deserialize<T>(cachedData);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache GetAsync notice for key '{key}': {ex.Message}");
                return default;
            }
        }

        public async Task SetAsync<T>(string key, T value, TimeSpan? absoluteExpireTime = null)
        {
            try
            {
                var options = new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = absoluteExpireTime ?? TimeSpan.FromMinutes(10)
                };

                var jsonData = JsonSerializer.Serialize(value);
                await _cache.SetStringAsync(key, jsonData, options);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache SetAsync notice for key '{key}': {ex.Message}");
            }
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, System.Threading.SemaphoreSlim> _locks = new();

        public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> getItemCallback, TimeSpan? absoluteExpireTime = null)
        {
            var cached = await GetAsync<T>(key);
            if (cached != null)
            {
                return cached;
            }

            var semaphore = _locks.GetOrAdd(key, _ => new System.Threading.SemaphoreSlim(1, 1));
            await semaphore.WaitAsync();
            try
            {
                // Double-check cache after acquiring lock
                cached = await GetAsync<T>(key);
                if (cached != null)
                {
                    return cached;
                }

                var item = await getItemCallback();
                if (item != null)
                {
                    await SetAsync(key, item, absoluteExpireTime);
                }
                return item;
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task RemoveByPatternAsync(string pattern)
        {
            try
            {
                if (_redisConnection != null && _redisConnection.IsConnected)
                {
                    var endpoints = _redisConnection.GetEndPoints();
                    var db = _redisConnection.GetDatabase();
                    var searchPattern = pattern.Contains("*") ? pattern : $"*{pattern}*";
                    if (!searchPattern.StartsWith("*")) searchPattern = $"*{searchPattern}";

                    foreach (var endpoint in endpoints)
                    {
                        var server = _redisConnection.GetServer(endpoint);
                        if (server.IsConnected)
                        {
                            var redisKeys = server.Keys(pattern: searchPattern).ToArray();
                            if (redisKeys.Length > 0)
                            {
                                await db.KeyDeleteAsync(redisKeys);
                            }
                        }
                    }
                }
                else
                {
                    await _cache.RemoveAsync(pattern.Trim('*'));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache RemoveByPatternAsync notice for pattern '{pattern}': {ex.Message}");
            }
        }

        public async Task RemoveAsync(string key)
        {
            try
            {
                await _cache.RemoveAsync(key);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache RemoveAsync notice for key '{key}': {ex.Message}");
            }
        }

        public async Task<long> IncrementAsync(string key, long value = 1)
        {
            try
            {
                MangaMetrics.ChapterViewsIncrementedTotal.WithLabels(ExtractKeyPrefix(key)).Inc(value);

                if (_redisConnection != null && _redisConnection.IsConnected)
                {
                    var db = _redisConnection.GetDatabase();
                    return await db.StringIncrementAsync(key, value);
                }

                var current = await GetAsync<long?>(key) ?? 0;
                var updated = current + value;
                await SetAsync(key, updated, TimeSpan.FromDays(30));
                return updated;
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache IncrementAsync notice for key '{key}': {ex.Message}");
                return 0;
            }
        }

        public async Task<List<string>> GetKeysAsync(string pattern)
        {
            var keys = new List<string>();
            try
            {
                if (_redisConnection != null && _redisConnection.IsConnected)
                {
                    var endpoints = _redisConnection.GetEndPoints();
                    foreach (var endpoint in endpoints)
                    {
                        var server = _redisConnection.GetServer(endpoint);
                        if (server.IsConnected)
                        {
                            var redisKeys = server.Keys(pattern: pattern).Select(k => k.ToString());
                            keys.AddRange(redisKeys);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache GetKeysAsync notice for pattern '{pattern}': {ex.Message}");
            }
            return await Task.FromResult(keys.Distinct().ToList());
        }

        public async Task<long> GetAndResetCountAsync(string key)
        {
            try
            {
                if (_redisConnection != null && _redisConnection.IsConnected)
                {
                    var db = _redisConnection.GetDatabase();
                    var keyType = await db.KeyTypeAsync(key);
                    if (keyType != RedisType.String)
                    {
                        if (keyType != RedisType.None)
                        {
                            await db.KeyDeleteAsync(key);
                        }
                        return 0;
                    }

                    var currentVal = await db.StringGetSetAsync(key, 0);
                    if (currentVal.HasValue && long.TryParse(currentVal.ToString(), out long count) && count > 0)
                    {
                        await db.KeyDeleteAsync(key);
                        return count;
                    }
                    return 0;
                }

                var val = await GetAsync<long?>(key) ?? 0;
                if (val > 0)
                {
                    await RemoveAsync(key);
                }
                return val;
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Cache GetAndResetCountAsync notice for key '{key}': {ex.Message}");
                return 0;
            }
        }
    }
}

