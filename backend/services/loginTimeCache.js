const db = require('./postgres');

/**
 * LOGIN TIME CACHE
 *
 * Tracks user login time from Adversus API for "deals per hour" calculation
 *
 * Strategy:
 * - Fetch from Adversus API: GET /v1/users/{userId}/loginTime
 * - Store in PostgreSQL for historical tracking
 * - Cache today's data in memory for fast access
 * - Auto-sync every 30 minutes (login time changes slowly)
 */
class LoginTimeCache {
  constructor() {
    console.log(`⏱️ Login time cache (PostgreSQL + memory cache)`);

    // In-memory cache - user_id -> { loginSeconds, fromDate, toDate }
    this.cache = new Map();

    // Last sync timestamp
    this.lastSync = null;

    // Sync interval: 2 minutes (login time changes as agents work)
    // Updated frequently because deals/hour changes constantly:
    // - When deal comes: deals++ → deals/h UP
    // - When time passes: loginTime++ → deals/h DOWN
    this.syncIntervalMinutes = 2;
  }

  async init() {
    try {
      await db.init();
      console.log('✅ Login time cache initialized');
    } catch (error) {
      console.error('❌ Error initializing login time cache:', error);
    }
  }

  /**
   * Fetch login time for a user from Adversus API
   */
  async fetchLoginTimeFromAdversus(adversusAPI, userId, fromDate, toDate) {
    try {
      console.log(`🔍 Fetching login time for user ${userId} from Adversus...`);

      const response = await adversusAPI.request(`/users/${userId}/loginTime`, {
        method: 'GET',
        params: {
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString()
        }
      });

      const loginSeconds = parseInt(response.loginSeconds || 0);

      console.log(`   ✅ User ${userId}: ${loginSeconds} seconds (${(loginSeconds / 3600).toFixed(2)} hours)`);

      return {
        userId,
        loginSeconds,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      };
    } catch (error) {
      console.error(`❌ Error fetching login time for user ${userId}:`, error.message);
      return {
        userId,
        loginSeconds: 0,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      };
    }
  }

  /**
   * Save login time to PostgreSQL
   */
  async saveLoginTime(data) {
    try {
      const query = `
        INSERT INTO user_login_time (user_id, login_seconds, from_date, to_date)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, from_date, to_date)
        DO UPDATE SET
          login_seconds = EXCLUDED.login_seconds,
          synced_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        data.userId,
        data.loginSeconds,
        data.fromDate,
        data.toDate
      ];

      const result = await db.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error(`❌ Error saving login time:`, error);
      throw error;
    }
  }

  /**
   * Get login time for a user in date range (from DB or cache)
   */
  async getLoginTime(userId, fromDate, toDate) {
    const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      const age = Date.now() - cached.cachedAt;

      // Cache valid for 30 minutes
      if (age < this.syncIntervalMinutes * 60 * 1000) {
        console.log(`💾 Cache HIT for user ${userId} login time`);
        return cached.data;
      }
    }

    // Query from database
    try {
      const query = `
        SELECT * FROM user_login_time
        WHERE user_id = $1
          AND from_date <= $2
          AND to_date >= $3
        ORDER BY synced_at DESC
        LIMIT 1
      `;

      const result = await db.pool.query(query, [userId, toDate, fromDate]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const data = {
          userId: row.user_id,
          loginSeconds: row.login_seconds,
          fromDate: row.from_date,
          toDate: row.to_date,
          syncedAt: row.synced_at
        };

        // Update cache
        this.cache.set(cacheKey, {
          data,
          cachedAt: Date.now()
        });

        return data;
      }

      // No data found
      return {
        userId,
        loginSeconds: 0,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      };
    } catch (error) {
      console.error(`❌ Error getting login time from DB:`, error);
      throw error;
    }
  }

  /**
   * Sync login time for multiple users (used by leaderboard)
   */
  async syncLoginTimeForUsers(adversusAPI, userIds, fromDate, toDate) {
    console.log(`\n⏱️ SYNCING LOGIN TIME FOR ${userIds.length} USERS...`);
    console.log(`   Date range: ${fromDate.toISOString()} → ${toDate.toISOString()}`);

    const results = [];

    for (const userId of userIds) {
      try {
        // Fetch from Adversus
        const data = await this.fetchLoginTimeFromAdversus(adversusAPI, userId, fromDate, toDate);

        // Save to database
        await this.saveLoginTime(data);

        // Update cache
        const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;
        this.cache.set(cacheKey, {
          data,
          cachedAt: Date.now()
        });

        results.push(data);

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`⚠️  Failed to sync login time for user ${userId}:`, error.message);
        results.push({
          userId,
          loginSeconds: 0,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString()
        });
      }
    }

    this.lastSync = new Date().toISOString();
    console.log(`✅ Login time sync complete for ${results.length} users`);

    return results;
  }

  /**
   * Sync login time for a SINGLE user (used after deal)
   */
  async syncLoginTimeForUser(adversusAPI, userId, fromDate, toDate) {
    try {
      console.log(`⏱️ Syncing login time for user ${userId} after deal...`);

      // Fetch from Adversus
      const data = await this.fetchLoginTimeFromAdversus(adversusAPI, userId, fromDate, toDate);

      // Save to database
      await this.saveLoginTime(data);

      // Update cache
      const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;
      this.cache.set(cacheKey, {
        data,
        cachedAt: Date.now()
      });

      console.log(`✅ Login time synced for user ${userId}: ${data.loginSeconds}s (${(data.loginSeconds / 3600).toFixed(2)}h)`);

      return data;
    } catch (error) {
      console.error(`⚠️ Failed to sync login time for user ${userId}:`, error.message);
      return {
        userId,
        loginSeconds: 0,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      };
    }
  }

  /**
   * Check if sync is needed
   */
  async needsSync() {
    if (!this.lastSync) {
      return true;
    }

    const lastSyncDate = new Date(this.lastSync);
    const minutesSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60);

    if (minutesSinceSync >= this.syncIntervalMinutes) {
      console.log(`⏰ Last login time sync was ${Math.round(minutesSinceSync)} min ago - needs sync`);
      return true;
    }

    return false;
  }

  /**
   * Calculate deals per hour for a user
   */
  calculateDealsPerHour(dealCount, loginSeconds) {
    if (loginSeconds === 0) {
      return 0;
    }

    const loginHours = loginSeconds / 3600;
    const dealsPerHour = dealCount / loginHours;

    return parseFloat(dealsPerHour.toFixed(2));
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      cachedUsers: this.cache.size,
      lastSync: this.lastSync,
      syncIntervalMinutes: this.syncIntervalMinutes
    };
  }

  /**
   * Clear cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️  Cleared ${size} login time cache entries`);
  }
}

module.exports = new LoginTimeCache();
