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
   *
   * Uses timestamp filter which allows fetching ANY period (not limited to 7 days)
   * Filter format: filters={"timestamp":{"$gt":"...","$lt":"..."}}
   */
  async fetchLoginTimeFromAdversus(adversusAPI, userId, fromDate, toDate) {
    try {
      const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));

      console.log(`🔍 Fetching login time for user ${userId} (${daysDiff} days: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]})`);

      // Use timestamp filter - works for any period!
      const filters = {
        "timestamp": {
          "$gt": fromDate.toISOString(),
          "$lt": toDate.toISOString()
        }
      };

      const response = await adversusAPI.request(`/users/${userId}/loginTime`, {
        method: 'GET',
        params: {
          filters: JSON.stringify(filters)
        }
      });

      const loginSeconds = parseInt(response.loginSeconds || 0);
      console.log(`   ✅ User ${userId}: ${loginSeconds} seconds (${(loginSeconds / 3600).toFixed(2)} hours)`);
      console.log(`   📅 API returned: ${response.fromDate} → ${response.toDate}`);

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
   * Fetch login time for ALL users from Adversus workforce API
   * Much more efficient than individual calls - avoids rate limiting!
   *
   * Returns: Map<userId, loginSeconds>
   */
  async fetchLoginTimeFromWorkforce(adversusAPI, fromDate, toDate) {
    try {
      console.log(`🏭 Fetching workforce data for all users...`);
      console.log(`   Date range: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);

      const response = await adversusAPI.request('/workforce/buildReport', {
        method: 'POST',
        data: {
          start: fromDate.toISOString(),
          end: toDate.toISOString()
          // No userId = get ALL users
        }
      });

      // Parse NDJSON response (newline-delimited JSON)
      if (typeof response !== 'string') {
        throw new Error('Expected NDJSON string response from workforce API');
      }

      const lines = response.trim().split('\n');
      const records = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.warn('⚠️  Failed to parse NDJSON line:', line.substring(0, 100));
          return null;
        }
      }).filter(r => r !== null);

      console.log(`   ✅ Parsed ${records.length} workforce records`);

      // Group by userId and sum durations
      const userLoginMap = new Map();

      records.forEach(record => {
        const userId = record.userid || record.userId;
        const duration = parseFloat(record.duration || 0);

        if (userId) {
          const current = userLoginMap.get(userId) || 0;
          userLoginMap.set(userId, current + duration);
        }
      });

      console.log(`   📊 Calculated login time for ${userLoginMap.size} users`);

      return userLoginMap;
    } catch (error) {
      console.error(`❌ Error fetching workforce data:`, error.message);
      throw error;
    }
  }

  /**
   * Sync login time for multiple users (used by leaderboard)
   *
   * SMART STRATEGY: Split historical data + today's data
   * - Historical data (past days): Cached permanently in DB, never changes
   * - Today's data: Fetched live from workforce API
   *
   * Example: For "this month" (Nov 1-12)
   * - Historical (Nov 1-11): Load from DB (1 query) - cached forever
   * - Today (Nov 12): Fetch from API (1 call) - live data
   * - Total: Sum both = Complete accurate data with minimal API calls!
   */
  async syncLoginTimeForUsers(adversusAPI, userIds, fromDate, toDate) {
    console.log(`\n⏱️ SYNCING LOGIN TIME FOR ${userIds.length} USERS...`);
    console.log(`   Date range: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);

    const results = [];
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    // Check if period includes past days
    const includesPastDays = fromDate < todayStart;
    const includesToday = toDate >= todayStart;

    console.log(`   📅 Strategy: Historical=${includesPastDays}, Today=${includesToday}`);

    try {
      let historicalMap = new Map(); // userId -> loginSeconds
      let todayMap = new Map();      // userId -> loginSeconds

      // PART 1: Load historical data from DB (if needed)
      if (includesPastDays) {
        const histEnd = includesToday
          ? new Date(todayStart.getTime() - 1) // Yesterday 23:59:59
          : toDate;

        console.log(`   📚 Loading historical data from DB: ${fromDate.toISOString().split('T')[0]} → ${histEnd.toISOString().split('T')[0]}`);

        for (const userId of userIds) {
          try {
            const cached = await this.getLoginTime(userId, fromDate, histEnd);
            if (cached && cached.loginSeconds > 0) {
              historicalMap.set(userId, cached.loginSeconds);
              console.log(`   💾 User ${userId}: ${cached.loginSeconds}s from DB (historical)`);
            } else {
              // No cached data, fetch from workforce for this historical period
              console.log(`   ⚠️  User ${userId}: No historical data in DB, will fetch from API`);
            }
          } catch (error) {
            console.warn(`   ⚠️  Failed to load historical data for user ${userId}:`, error.message);
          }
        }

        // If some users are missing historical data, fetch it
        const missingUsers = userIds.filter(id => !historicalMap.has(id));
        if (missingUsers.length > 0) {
          console.log(`   🏭 Fetching missing historical data for ${missingUsers.length} users from workforce API...`);
          const missingMap = await this.fetchLoginTimeFromWorkforce(adversusAPI, fromDate, histEnd);

          for (const userId of missingUsers) {
            const loginSeconds = Math.round(missingMap.get(parseInt(userId)) || 0);
            historicalMap.set(userId, loginSeconds);

            // Save historical data permanently
            await this.saveLoginTime({
              userId,
              loginSeconds,
              fromDate: fromDate.toISOString(),
              toDate: histEnd.toISOString()
            });

            console.log(`   👤 User ${userId}: ${loginSeconds}s fetched and saved (historical)`);
          }
        }
      }

      // PART 2: Fetch today's data live (if needed)
      if (includesToday) {
        console.log(`   🏭 Fetching TODAY's data from workforce API...`);
        todayMap = await this.fetchLoginTimeFromWorkforce(adversusAPI, todayStart, todayEnd);

        // Save today's data (with short cache)
        for (const [userId, loginSeconds] of todayMap) {
          await this.saveLoginTime({
            userId: userId.toString(),
            loginSeconds: Math.round(loginSeconds),
            fromDate: todayStart.toISOString(),
            toDate: todayEnd.toISOString()
          });
        }
      }

      // PART 3: Combine historical + today for each user
      for (const userId of userIds) {
        const historicalSeconds = historicalMap.get(userId) || 0;
        const todaySeconds = Math.round(todayMap.get(parseInt(userId)) || 0);
        const totalSeconds = historicalSeconds + todaySeconds;

        const data = {
          userId,
          loginSeconds: totalSeconds,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString()
        };

        if (includesPastDays && includesToday) {
          console.log(`   👤 User ${userId}: ${totalSeconds}s (${historicalSeconds}s historical + ${todaySeconds}s today)`);
        } else if (includesPastDays) {
          console.log(`   👤 User ${userId}: ${totalSeconds}s (historical only)`);
        } else {
          console.log(`   👤 User ${userId}: ${totalSeconds}s (today only)`);
        }

        // Update cache
        const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;
        this.cache.set(cacheKey, {
          data,
          cachedAt: Date.now()
        });

        results.push(data);
      }

      this.lastSync = new Date().toISOString();
      console.log(`✅ Login time sync complete for ${results.length} users`);
      console.log(`   📊 Strategy used: Historical=${includesPastDays ? 'YES' : 'NO'}, Today=${includesToday ? 'YES' : 'NO'}`);

      return results;

    } catch (error) {
      console.error(`❌ Sync failed:`, error.message);

      // Return zero data rather than failing completely
      return userIds.map(userId => ({
        userId,
        loginSeconds: 0,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      }));
    }
  }

  /**
   * Sync login time for a SINGLE user (used after deal)
   *
   * OPTIMIZATION: Don't make individual API calls here!
   * Just invalidate cache so next leaderboard sync will fetch fresh data.
   * This avoids rate limiting from frequent individual calls.
   */
  async syncLoginTimeForUser(adversusAPI, userId, fromDate, toDate) {
    try {
      console.log(`⏱️ Invalidating login time cache for user ${userId} after deal...`);

      // Invalidate cache for this user - forces fresh fetch on next leaderboard sync
      const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;
      this.cache.delete(cacheKey);

      console.log(`✅ Cache invalidated for user ${userId} - will refresh on next sync`);

      // Return placeholder - actual data will be fetched on next leaderboard sync
      return {
        userId,
        loginSeconds: 0, // Placeholder - will be updated on next sync
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        invalidated: true
      };
    } catch (error) {
      console.error(`⚠️ Failed to invalidate cache for user ${userId}:`, error.message);
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
