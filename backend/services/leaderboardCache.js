// Simple in-memory cache for leaderboard stats
class LeaderboardCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Generate cache key
  getCacheKey(leaderboardId, startDate, endDate) {
    return `${leaderboardId}-${startDate}-${endDate}`;
  }

  // Get from cache
  get(leaderboardId, startDate, endDate) {
    const key = this.getCacheKey(leaderboardId, startDate, endDate);
    const cached = this.cache.get(key);
    
    if (!cached) {
      console.log(`💾 Cache MISS: ${leaderboardId}`);
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTimeout) {
      console.log(`⏰ Cache EXPIRED: ${leaderboardId} (${Math.round(age/1000)}s old)`);
      this.cache.delete(key);
      return null;
    }
    
    console.log(`✅ Cache HIT: ${leaderboardId} (${Math.round(age/1000)}s old)`);
    return cached.data;
  }

  // Set cache
  set(leaderboardId, startDate, endDate, data) {
    const key = this.getCacheKey(leaderboardId, startDate, endDate);
    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
    console.log(`💾 Cached: ${leaderboardId}`);
  }

  // Invalidate specific leaderboard
  invalidate(leaderboardId) {
    let count = 0;
    for (const [key, value] of this.cache.entries()) {
      if (key.startsWith(leaderboardId + '-')) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      console.log(`🗑️  Invalidated ${count} cache entries for ${leaderboardId}`);
    }
  }

  // Clear all cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️  Cleared ${size} cache entries`);
  }

  // Get stats
  getStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;
    
    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp;
      if (age > this.cacheTimeout) {
        expired++;
      } else {
        valid++;
      }
    }
    
    return { total: this.cache.size, valid, expired };
  }
}

module.exports = new LeaderboardCache();
