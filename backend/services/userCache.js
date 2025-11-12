/**
 * USER CACHE SERVICE
 *
 * Global cache for Adversus users to prevent excessive API calls
 * Updated by central sync scheduler every 3 minutes
 * All endpoints should use this cache instead of calling adversusAPI.getUsers() directly
 */

class UserCache {
  constructor() {
    this.users = [];
    this.lastUpdate = null;
    this.maxAge = 15 * 60 * 1000; // 15 minutes max age
  }

  /**
   * Update cache with fresh users data
   * Called by central sync scheduler
   */
  update(users) {
    this.users = users || [];
    this.lastUpdate = new Date();
    console.log(`💾 User cache updated: ${this.users.length} users`);
  }

  /**
   * Get cached users
   * Returns cached data without making API calls
   */
  getUsers() {
    const age = this.lastUpdate ? Date.now() - this.lastUpdate : Infinity;
    const ageMinutes = Math.round(age / 1000 / 60);

    if (!this.lastUpdate) {
      console.warn('⚠️  User cache not initialized yet, returning empty array');
      return [];
    }

    if (age > this.maxAge) {
      console.warn(`⚠️  User cache is stale (${ageMinutes} min old), but returning anyway`);
    }

    // Always return cached data, never make API calls
    return this.users;
  }

  /**
   * Get cache status
   */
  getStatus() {
    const age = this.lastUpdate ? Date.now() - this.lastUpdate : null;
    const ageMinutes = age ? Math.round(age / 1000 / 60) : null;

    return {
      userCount: this.users.length,
      lastUpdate: this.lastUpdate,
      ageMinutes: ageMinutes,
      isStale: age > this.maxAge
    };
  }

  /**
   * Check if cache is initialized
   */
  isInitialized() {
    return this.lastUpdate !== null && this.users.length > 0;
  }
}

module.exports = new UserCache();
