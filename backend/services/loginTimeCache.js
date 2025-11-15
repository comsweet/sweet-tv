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

    // Sync interval: 2 minutes (must be >= central sync interval of 1 min)
    // Central sync scheduler handles all login time updates every 1 minute
    // This cache just reads from DB - no need to sync more frequently
    // Slightly higher interval = fewer redundant API calls = no rate limits!
    this.syncIntervalMinutes = 2;

    // Last time we synced TODAY'S data specifically
    // Used to avoid re-fetching same day data for different leaderboards
    this.lastTodaySync = null;

    // Ongoing sync lock - prevents multiple simultaneous syncs
    this.ongoingSync = null;
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
          login_seconds = CASE
            -- For TODAY or future dates: Always update (data comes in continuously)
            WHEN user_login_time.from_date >= CURRENT_DATE THEN EXCLUDED.login_seconds
            -- For HISTORICAL dates: Only update if new value is HIGHER (more complete data)
            ELSE GREATEST(user_login_time.login_seconds, EXCLUDED.login_seconds)
          END,
          synced_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        data.userId,
        data.loginSeconds,
        data.fromDate,
        data.toDate
      ];

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error(`❌ Error saving login time:`, error);
      throw error;
    }
  }

  /**
   * Check if we have data for a specific day in DB
   * Used by historical sync to skip days that are already synced
   * @deprecated Use countUsersWithDataForDay instead to check ALL users
   */
  async hasDayInDB(userId, fromDate, toDate) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM user_login_time
        WHERE user_id = $1
          AND from_date = $2
          AND to_date = $3
          AND synced_at IS NOT NULL
      `;

      const values = [
        userId,
        fromDate.toISOString(),
        toDate.toISOString()
      ];

      const result = await db.query(query, values);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error(`❌ Error checking if day exists in DB:`, error);
      return false; // Assume not exists on error = will try to sync
    }
  }

  /**
   * Count how many users have data for a specific day in DB
   * Used by historical sync to ensure ALL users have data before skipping
   * @returns {number} Count of users with data for this day
   */
  async countUsersWithDataForDay(fromDate, toDate) {
    try {
      const query = `
        SELECT COUNT(DISTINCT user_id) as count
        FROM user_login_time
        WHERE from_date = $1
          AND to_date = $2
          AND synced_at IS NOT NULL
      `;

      const values = [
        fromDate.toISOString(),
        toDate.toISOString()
      ];

      const result = await db.query(query, values);
      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      console.error(`❌ Error counting users with data for day:`, error);
      return 0; // Return 0 on error = will try to sync
    }
  }

  /**
   * Get login time for a user in date range (from DB or cache)
   * If not found, will attempt to fetch from workforce API
   */
  async getLoginTime(userId, fromDate, toDate, adversusAPI = null) {
    const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      const age = Date.now() - cached.cachedAt;

      // CRITICAL FIX: Cache 0-values for only 10 seconds!
      // This prevents "0 order/h" from sticking after deals are added
      // When central sync updates DB (every 1 min), next request will get fresh data
      const maxAge = cached.data.loginSeconds === 0
        ? 10 * 1000 // 10 seconds for 0-values (allows quick recovery)
        : this.syncIntervalMinutes * 60 * 1000; // 2 minutes for real values

      if (age < maxAge) {
        const ageSeconds = Math.round(age / 1000);
        console.log(`💾 Cache HIT for user ${userId} login time: ${cached.data.loginSeconds}s (age: ${ageSeconds}s, maxAge: ${Math.round(maxAge/1000)}s)`);
        return cached.data;
      } else {
        console.log(`⏰ Cache EXPIRED for user ${userId} (age: ${Math.round(age/1000)}s > ${Math.round(maxAge/1000)}s), fetching from DB...`);
      }
    }

    // Query from database
    try {
      // Try exact match first (best case)
      const exactQuery = `
        SELECT * FROM user_login_time
        WHERE user_id = $1
          AND from_date = $2
          AND to_date = $3
        ORDER BY synced_at DESC
        LIMIT 1
      `;

      let result = await db.query(exactQuery, [userId, fromDate, toDate]);

      // DEBUG: Log exact match attempt
      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = toDate.toISOString().split('T')[0];
      console.log(`🔍 loginTime query for user ${userId}: ${fromStr} → ${toStr} (found: ${result.rows.length} exact matches)`);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`   ✅ EXACT MATCH: ${row.login_seconds}s (${(row.login_seconds/3600).toFixed(2)}h) synced at ${new Date(row.synced_at).toISOString()}`);
      }

      // CRITICAL FIX: If no exact match found and period spans multiple days,
      // sum all day-by-day entries instead of using overlapping period averages
      if (result.rows.length === 0) {
        // Calculate how many days are in the requested period
        const requestedDays = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));

        if (requestedDays > 1) {
          console.log(`📅 Multi-day period detected (${requestedDays} days), summing day-by-day entries...`);

          // Query for all day-by-day entries within the period
          const dayByDayQuery = `
            SELECT
              from_date::date as day,
              login_seconds,
              EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as period_days
            FROM user_login_time
            WHERE user_id = $1
              AND from_date >= $2
              AND to_date <= $3
            ORDER BY from_date ASC
          `;

          const dayResults = await db.query(dayByDayQuery, [userId, fromDate, toDate]);

          if (dayResults.rows.length > 0) {
            // Sum only SINGLE-DAY entries (period_days <= 1)
            // Ignore any remaining big period entries
            let totalLoginSeconds = 0;
            let singleDayCount = 0;

            dayResults.rows.forEach(row => {
              if (row.period_days <= 1) {
                totalLoginSeconds += row.login_seconds;
                singleDayCount++;
              } else {
                console.warn(`   ⚠️  Skipping big period entry: ${row.day} (${row.period_days.toFixed(1)} days) - should have been cleaned!`);
              }
            });

            // CRITICAL CHECK: Verify we have ALL days in the period
            // If missing days, the sum is incomplete and order/h will be ABSURDLY HIGH!
            if (singleDayCount < requestedDays) {
              console.error(`❌ INCOMPLETE DATA: Expected ${requestedDays} days, found only ${singleDayCount} days in DB!`);
              console.error(`   This will cause WRONG order/h calculation!`);
              console.error(`   Missing ${requestedDays - singleDayCount} days of login time data.`);

              // Return null to indicate incomplete data - caller should handle gracefully
              // Better to show no data than WRONG data!
              return null;
            }

            console.log(`   ✅ Summed ${singleDayCount} single-day entries: ${totalLoginSeconds}s (${(totalLoginSeconds/3600).toFixed(2)}h)`);

            const data = {
              userId,
              loginSeconds: totalLoginSeconds,
              fromDate: fromDate.toISOString(),
              toDate: toDate.toISOString(),
              syncedAt: new Date().toISOString(),
              isSummed: true  // Mark as summed from multiple days
            };

            // Cache the summed result
            this.cache.set(cacheKey, {
              data,
              cachedAt: Date.now()
            });

            return data;
          } else {
            console.log(`   ℹ️ No day-by-day entries found, period may not be synced yet`);
          }
        }

        // Single-day period OR no day-by-day entries found
        // Try overlapping period as last resort (for backwards compatibility)
        const rangeQuery = `
          SELECT * FROM user_login_time
          WHERE user_id = $1
            AND from_date <= $2
            AND to_date >= $3
          ORDER BY synced_at DESC
          LIMIT 1
        `;

        result = await db.query(rangeQuery, [userId, toDate, fromDate]);

        if (result.rows.length > 0) {
          const row = result.rows[0];

          // Calculate daily average from the larger period
          const periodStart = new Date(row.from_date);
          const periodEnd = new Date(row.to_date);
          const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
          const dailyAverage = Math.round(row.login_seconds / totalDays);

          console.log(`📊 Found overlapping period for user ${userId}: ${row.from_date.toISOString().split('T')[0]} → ${row.to_date.toISOString().split('T')[0]} (${totalDays} days)`);
          console.log(`   Total: ${row.login_seconds}s → Daily average: ${dailyAverage}s (${(dailyAverage/3600).toFixed(2)}h)`);
          console.warn(`   ⚠️ Using daily average as fallback - this should only happen for old data!`);

          const data = {
            userId: row.user_id,
            loginSeconds: dailyAverage,  // Daily average as fallback
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            syncedAt: row.synced_at,
            isAverage: true  // Mark as averaged data
          };

          // Update cache
          this.cache.set(cacheKey, {
            data,
            cachedAt: Date.now()
          });

          return data;
        }
      }

      // Still no data found in DB
      if (result.rows.length === 0) {
        console.warn(`⚠️  No login time found in DB for user ${userId} (${fromStr} → ${toStr})`);

        // CRITICAL FIX: If querying TODAY'S data and we have adversusAPI, try API fallback
        // This prevents "0 order/h" when deals are added before central sync has run
        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        const isToday = fromDate >= todayStart;

        if (isToday && adversusAPI) {
          console.log(`🔄 Attempting API fallback for TODAY's login time (user ${userId})...`);
          try {
            const apiData = await this.fetchLoginTimeFromAdversus(adversusAPI, userId, fromDate, toDate);

            if (apiData.loginSeconds > 0) {
              // Save to DB for future requests
              await this.saveLoginTime(apiData);
              console.log(`✅ API fallback successful: ${apiData.loginSeconds}s (${(apiData.loginSeconds/3600).toFixed(2)}h)`);

              // Cache it (with short TTL since it's a fallback)
              this.cache.set(cacheKey, {
                data: apiData,
                cachedAt: Date.now()
              });

              return apiData;
            }
          } catch (error) {
            console.error(`❌ API fallback failed:`, error.message);
          }
        }

        // No fallback available or fallback failed - return 0
        console.warn(`   → Returning 0 (will be cached for only 10 seconds)`);
        return {
          userId,
          loginSeconds: 0,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString()
        };
      }

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

      // Parse response - can be NDJSON string or JSON array
      let records = [];

      if (typeof response === 'string') {
        // NDJSON format (newline-delimited JSON)
        const lines = response.trim().split('\n');
        records = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch (err) {
            console.warn('⚠️  Failed to parse NDJSON line:', line.substring(0, 100));
            return null;
          }
        }).filter(r => r !== null);
      } else if (Array.isArray(response)) {
        // Already parsed as JSON array
        records = response;
      } else if (response && typeof response === 'object') {
        // Single object or object with data property
        records = response.data || [response];
      } else {
        console.warn('⚠️  Unexpected workforce API response format:', typeof response);
        return new Map(); // Return empty map as fallback
      }

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
    // CRITICAL FIX: If period spans multiple days, sync each day separately
    // This prevents creating "big period" entries that cause incorrect daily averages
    const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));

    if (daysDiff > 1) {
      console.log(`\n⏱️ MULTI-DAY SYNC DETECTED: ${daysDiff} days`);
      console.log(`   🔄 Splitting into ${daysDiff} separate day-by-day syncs to ensure accuracy...`);

      const allResults = [];
      const currentDate = new Date(fromDate);

      while (currentDate <= toDate) {
        const dayStart = new Date(currentDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setUTCHours(23, 59, 59, 999);

        const dateStr = dayStart.toISOString().split('T')[0];
        console.log(`   📅 Syncing day: ${dateStr}`);

        // Recursively call for single day (will NOT trigger this split again)
        const dayResults = await this.syncLoginTimeForUsers(adversusAPI, userIds, dayStart, dayEnd);
        allResults.push(...dayResults);

        // Move to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      console.log(`   ✅ Multi-day sync complete: ${daysDiff} days synced`);
      return allResults;
    }

    // Single day sync (or already split from above)
    // If a sync is already ongoing, wait for it instead of starting a new one
    if (this.ongoingSync) {
      console.log(`⏳ Sync already in progress, waiting for it to complete...`);
      try {
        await this.ongoingSync;
        console.log(`✅ Previous sync completed, returning cached data`);

        // Return cached data for these users
        return userIds.map(userId => {
          const cacheKey = `${userId}-${fromDate.toISOString()}-${toDate.toISOString()}`;
          const cached = this.cache.get(cacheKey);
          return cached ? cached.data : {
            userId,
            loginSeconds: 0,
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString()
          };
        });
      } catch (error) {
        console.error(`⚠️ Previous sync failed:`, error.message);
      }
    }

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

    // Create sync promise and store it
    const syncPromise = (async () => {
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

            // CRITICAL: Distinguish between "0s in DB" vs "no DB entry"
            // getLoginTime never returns null - it returns { loginSeconds: 0 } for both cases
            // We use syncedAt field to detect if data came from DB or is just a stub
            if (cached && cached.syncedAt) {
              // Data exists in DB (even if 0s) - use it
              historicalMap.set(userId, cached.loginSeconds || 0);
              console.log(`   💾 User ${userId}: ${cached.loginSeconds}s from DB (historical)`);
            } else {
              // No DB entry - need to fetch from API
              console.log(`   ⚠️  User ${userId}: No data in DB, will fetch from API`);
            }
          } catch (error) {
            console.warn(`   ⚠️  Failed to load historical data for user ${userId}:`, error.message);
          }
        }

        // If some users are missing historical data, fetch it
        const missingUsers = userIds.filter(id => !historicalMap.has(id));
        if (missingUsers.length > 0) {
          console.log(`   🏭 Fetching missing historical data for ${missingUsers.length} users from workforce API...`);
          try {
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
          } catch (error) {
            console.error(`   ❌ Failed to fetch historical data from workforce API:`, error.message);
            // Continue with 0 values for missing users
            for (const userId of missingUsers) {
              historicalMap.set(userId, 0);
            }
          }
        }
      }

      // PART 2: Fetch today's data live (if needed)
      if (includesToday) {
        // Check if we already have fresh today's data
        const minutesSinceLastTodaySync = this.lastTodaySync
          ? (Date.now() - new Date(this.lastTodaySync).getTime()) / (1000 * 60)
          : Infinity;

        if (minutesSinceLastTodaySync < this.syncIntervalMinutes) {
          console.log(`   ⚡ Using cached TODAY's data (synced ${Math.round(minutesSinceLastTodaySync)} min ago)`);

          // Load from cache instead of API
          let missingFromCache = 0;
          for (const userId of userIds) {
            const cacheKey = `${userId}-${todayStart.toISOString()}-${todayEnd.toISOString()}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
              todayMap.set(parseInt(userId), cached.data.loginSeconds);
            } else {
              missingFromCache++;
            }
          }

          // If many users are missing from cache, refetch
          if (missingFromCache > userIds.length * 0.3) {
            console.log(`   ⚠️  ${missingFromCache}/${userIds.length} users missing from today's cache - refetching...`);
            try {
              todayMap = await this.fetchLoginTimeFromWorkforce(adversusAPI, todayStart, todayEnd);

              // Save today's data
              for (const [userId, loginSeconds] of todayMap) {
                await this.saveLoginTime({
                  userId: userId.toString(),
                  loginSeconds: Math.round(loginSeconds),
                  fromDate: todayStart.toISOString(),
                  toDate: todayEnd.toISOString()
                });
              }

              this.lastTodaySync = new Date().toISOString();
            } catch (error) {
              console.error(`   ❌ Failed to refetch today's data:`, error.message);
              // Use cached data even if partial
            }
          }
        } else {
          console.log(`   🏭 Fetching TODAY's data from workforce API...`);
          try {
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

            // Mark that we just synced today's data
            this.lastTodaySync = new Date().toISOString();
          } catch (error) {
            console.error(`   ❌ Failed to fetch today's data:`, error.message);
            // Continue with empty map (will use historical data only)
            todayMap = new Map();
          }
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

        // Save combined total to DB (not just cache!)
        // This ensures getLoginTime() can retrieve it even after cache expires
        await this.saveLoginTime(data);
        console.log(`   💾 Saved to DB: ${userId} → ${totalSeconds}s for period ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

        // Update memory cache
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
    })();

    // Store ongoing sync promise
    this.ongoingSync = syncPromise;

    // Wait for sync and clear lock
    try {
      const result = await syncPromise;
      return result;
    } finally {
      this.ongoingSync = null;
    }
  }

  /**
   * Sync login time for a SINGLE user (used after deal)
   *
   * Uses workforce API even for single user - avoids old individual /loginTime endpoint
   * This ensures we get accurate data without rate limiting issues
   */
  async syncLoginTimeForUser(adversusAPI, userId, fromDate, toDate) {
    try {
      console.log(`⏱️ Syncing login time for user ${userId} after deal...`);

      // Use syncLoginTimeForUsers (workforce API) even for single user
      // Much more reliable than individual /loginTime calls
      const results = await this.syncLoginTimeForUsers(adversusAPI, [userId], fromDate, toDate);

      if (results && results.length > 0) {
        console.log(`✅ Login time synced for user ${userId}: ${results[0].loginSeconds}s`);
        return results[0];
      }

      // Fallback if sync failed
      return {
        userId,
        loginSeconds: 0,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      };
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
    // Minimum 5 minutes (300 seconds) to calculate meaningful deals/hour
    // Prevents absurd numbers like 1024 deals/h from 10 seconds login time
    const MIN_LOGIN_TIME = 300; // 5 minutes

    // CRITICAL FIX: If there are deals but no login time, return null instead of 0
    // This prevents misleading "0.00 order/h" display while waiting for central sync
    if (loginSeconds === 0) {
      if (dealCount > 0) {
        // Has deals but no login time yet - incomplete data
        return null;
      }
      // No deals and no login time - show 0
      return 0;
    }

    if (loginSeconds < MIN_LOGIN_TIME) {
      console.log(`⚠️  User has only ${loginSeconds}s login time (< 5 min) - skipping deals/h calculation`);
      return 0;
    }

    const loginHours = loginSeconds / 3600;
    const dealsPerHour = dealCount / loginHours;
    const result = parseFloat(dealsPerHour.toFixed(2));

    // Log suspicious values for debugging
    if (result > 10) {
      console.log(`⚠️  High deals/h detected: ${result} (${dealCount} deals / ${(loginSeconds/3600).toFixed(2)}h)`);
    }

    return result;
  }

  /**
   * Get stats
   */
  async getStats() {
    try {
      const db = require('./postgres');

      // Get database stats
      const dbResult = await db.query('SELECT COUNT(*) as count FROM user_login_time');
      const totalRecords = parseInt(dbResult.rows[0]?.count || 0);

      // Get today's record count
      const today = new Date();
      const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
      const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

      const todayResult = await db.query(
        'SELECT COUNT(*) as count FROM user_login_time WHERE from_date >= $1 AND to_date <= $2',
        [todayStart, todayEnd]
      );
      const todayRecords = parseInt(todayResult.rows[0]?.count || 0);

      return {
        cachedUsers: this.cache.size,
        lastSync: this.lastSync,
        lastTodaySync: this.lastTodaySync,
        syncIntervalMinutes: this.syncIntervalMinutes,
        totalRecords,
        todayRecords,
        ongoingSync: !!this.ongoingSync
      };
    } catch (error) {
      console.error('❌ Error getting login time cache stats:', error);
      return {
        cachedUsers: this.cache.size,
        lastSync: this.lastSync,
        lastTodaySync: this.lastTodaySync,
        syncIntervalMinutes: this.syncIntervalMinutes,
        totalRecords: 0,
        todayRecords: 0,
        ongoingSync: !!this.ongoingSync
      };
    }
  }

  /**
   * Clear in-memory cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.lastSync = null;
    this.lastTodaySync = null;
    console.log(`🗑️  Cleared ${size} login time cache entries`);
  }

  /**
   * Invalidate cache and reload from database
   */
  async invalidateCache() {
    console.log('🔄 Invalidating login time cache...');
    this.clear();

    // Reload today's data from database
    const db = require('./postgres');
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    try {
      const result = await db.query(
        `SELECT user_id, from_date, to_date, login_seconds, synced_at
         FROM user_login_time
         WHERE from_date >= $1 AND to_date <= $2`,
        [todayStart, todayEnd]
      );

      // Reload into cache
      for (const row of result.rows) {
        const cacheKey = `${row.user_id}-${row.from_date.toISOString()}-${row.to_date.toISOString()}`;
        this.cache.set(cacheKey, {
          data: {
            loginSeconds: row.login_seconds,
            fromDate: row.from_date,
            toDate: row.to_date
          },
          timestamp: row.synced_at
        });
      }

      this.lastSync = new Date();
      this.lastTodaySync = new Date();
      console.log(`✅ Reloaded ${result.rows.length} today's records from database`);
    } catch (error) {
      console.error('❌ Error reloading cache from database:', error);
    }
  }

  /**
   * Force full resync from API
   */
  async forceSync(adversusAPI, userIds, fromDate, toDate) {
    console.log(`🔄 Force syncing login time for ${userIds.length} users...`);
    this.clear();
    return await this.syncLoginTimeForUsers(adversusAPI, userIds, fromDate, toDate);
  }

  /**
   * Clear database
   */
  async clearDatabase() {
    const db = require('./postgres');
    await db.query('TRUNCATE TABLE user_login_time CASCADE');
    this.clear();
    console.log('🗑️  Cleared login time database and cache');
  }
}

module.exports = new LoginTimeCache();
