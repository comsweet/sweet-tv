const db = require('./postgres');

/**
 * IMPROVED SMS CACHE - PostgreSQL + Write-Through Cache
 *
 * Strategy:
 * - ALL data persisted in PostgreSQL (historical data preserved)
 * - In-memory cache for TODAY's data only (fast access)
 * - Write-through: Save to DB immediately, update cache synchronously
 * - Auto-sync: Smart UPSERT strategy every 2 minutes
 *
 * Rolling window for sync: Current month + 7 days before
 * Cache window: Today only (00:00 - 23:59)
 */
class SMSCache {
  constructor() {
    console.log(`📱 SMS cache (PostgreSQL + write-through)`);

    // In-memory cache - ONLY for today's data
    this.todayCache = new Map(); // smsId -> sms

    // Retry queue for failed DB writes
    this.retryQueue = [];
    this.retryTimer = null;

    // Last sync timestamp
    this.lastSync = null;

    // Initialized flag
    this.initialized = false;

    // Init
    this.initCache();
  }

  async initCache() {
    try {
      // Ensure PostgreSQL is initialized
      await db.init();

      // Load today's SMS into cache
      await this.loadTodayCache();

      // Start retry processor
      this.startRetryProcessor();

      // Start midnight cache reset scheduler
      this.startMidnightScheduler();

      this.initialized = true;
      console.log('✅ SMS cache initialized with PostgreSQL');
    } catch (error) {
      console.error('❌ Error initializing SMS cache:', error);
    }
  }

  async _ensureInitialized() {
    if (!this.initialized) {
      await this.initCache();
    }
  }

  // Public init method for explicit initialization
  async init() {
    await this._ensureInitialized();
  }

  async loadTodayCache() {
    try {
      const { start, end } = this.getTodayWindow();
      const todaySMS = await db.getSMSInRange(start, end);

      // Populate cache
      this.todayCache.clear();

      for (const sms of todaySMS) {
        this.todayCache.set(sms.id, this.dbToCache(sms));
      }

      console.log(`📱 Loaded ${todaySMS.length} SMS into today's cache`);
    } catch (error) {
      console.error('❌ Error loading today SMS cache:', error);
      throw error; // Re-throw so caller knows it failed
    }
  }

  getTodayWindow() {
    // 🔥 FIX: Use Swedish time (Europe/Stockholm) instead of server local time
    // This prevents timezone mismatch with Adversus API which returns Swedish timestamps
    const nowSwedish = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
    const now = new Date(nowSwedish);

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Convert back to UTC for database queries (PostgreSQL stores in UTC)
    const startUTC = new Date(start.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
    const endUTC = new Date(end.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));

    return { start: startUTC, end: endUTC };
  }

  getRollingWindow() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Start: 7 days before month start
    const monthStart = new Date(currentYear, currentMonth, 1);
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - 7);

    // End: now
    const endDate = now;

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startDateFormatted: startDate.toISOString().split('T')[0],
      endDateFormatted: endDate.toISOString().split('T')[0]
    };
  }

  // Convert DB row to cache format
  dbToCache(dbRow) {
    return {
      id: dbRow.id,
      userId: dbRow.user_id,
      receiver: dbRow.receiver,
      timestamp: dbRow.timestamp,
      campaignId: dbRow.campaign_id,
      leadId: dbRow.lead_id,
      status: dbRow.status,
      syncedAt: dbRow.synced_at || dbRow.created_at
    };
  }

  // Convert cache format to DB format
  cacheToDb(sms) {
    return {
      id: sms.id,
      userId: sms.userId,
      receiver: sms.receiver,
      timestamp: sms.timestamp,
      campaignId: sms.campaignId,
      leadId: sms.leadId,
      status: sms.status
    };
  }

  /**
   * Retry processor for failed DB writes
   */
  startRetryProcessor() {
    this.retryTimer = setInterval(async () => {
      if (this.retryQueue.length > 0) {
        console.log(`🔄 Processing ${this.retryQueue.length} failed SMS DB writes...`);

        const toRetry = [...this.retryQueue];
        this.retryQueue = [];

        for (const sms of toRetry) {
          try {
            await db.insertSMS(this.cacheToDb(sms));
            console.log(`✅ Retry successful for SMS ${sms.id}`);
          } catch (error) {
            console.error(`❌ Retry failed for SMS ${sms.id}:`, error.message);
            this.retryQueue.push(sms); // Try again later
          }
        }
      }
    }, 30000); // Retry every 30 seconds
  }

  /**
   * Poll for NEW SMS only (timestamp-based incremental sync)
   */
  async pollNewSMS(adversusAPI) {
    await this._ensureInitialized();

    console.log('🔍 Polling for new SMS...');

    const lastSyncDate = new Date(this.lastSync);
    const now = new Date();

    console.log(`📅 Polling since: ${lastSyncDate.toISOString()}`);

    try {
      // Build filters for timestamp since last sync
      const filters = {
        type: { $eq: 'outbound' },
        timestamp: {
          $gt: lastSyncDate.toISOString(),
          $lt: now.toISOString()
        }
      };

      // Fetch SMS (should be minimal, usually 0-10)
      const result = await adversusAPI.getSMS(filters, 1, 1000);
      const smsArray = result.sms || [];

      if (smsArray.length === 0) {
        console.log('✅ No new SMS since last poll');
        this.lastSync = now.toISOString();
        return [];
      }

      console.log(`✅ Found ${smsArray.length} new SMS`);

      // Filter to only delivered SMS
      const deliveredSMS = smsArray.filter(sms => sms.status === 'delivered');

      console.log(`📱 Delivered SMS: ${deliveredSMS.length} / ${smsArray.length}`);

      // Normalize data
      const smsData = deliveredSMS.map(sms => ({
        id: sms.id,
        userId: parseInt(sms.userId),
        receiver: sms.receiver,
        timestamp: sms.timestamp,
        campaignId: sms.campaignId,
        leadId: sms.leadId,
        status: sms.status,
        syncedAt: new Date().toISOString()
      }));

      // Batch insert/update to PostgreSQL
      await db.batchInsertSMS(smsData.map(s => this.cacheToDb(s)));

      // Reload today's cache (in case new SMS are for today)
      await this.loadTodayCache();

      this.lastSync = now.toISOString();

      console.log(`💾 Polled ${smsData.length} SMS`);

      return smsData;
    } catch (error) {
      console.error('❌ Error polling new SMS:', error.message);
      throw error;
    }
  }

  /**
   * Sync SMS from Adversus with smart UPSERT strategy (FULL SYNC)
   */
  async syncSMS(adversusAPI) {
    await this._ensureInitialized();

    try {
      const { startDate, endDate, startDateFormatted, endDateFormatted } = this.getRollingWindow();

      console.log(`📱 Full sync: Fetching rolling window SMS from ${startDateFormatted} to ${endDateFormatted}`);

      // Build filters
      const filters = {
        type: { $eq: 'outbound' },
        timestamp: {
          $gt: startDate,
          $lt: endDate
        }
      };

      // Fetch all SMS (with pagination)
      let allSMS = [];
      let page = 1;
      let hasMore = true;
      const maxPages = 20; // Safety limit

      while (hasMore && page <= maxPages) {
        const result = await adversusAPI.getSMS(filters, page, 1000);
        const smsArray = result.sms || [];

        allSMS = [...allSMS, ...smsArray];

        console.log(`📱 Fetched page ${page}: ${smsArray.length} SMS`);

        const meta = result.meta;
        if (meta && meta.pagination) {
          console.log(`   📊 Pagination: page ${meta.pagination.page}/${meta.pagination.pageCount}`);
          hasMore = meta.pagination.page < meta.pagination.pageCount;
          page++;
        } else {
          if (smsArray.length === 1000) {
            console.log(`   ⚠️  No meta found, but got full page. Fetching next...`);
            page++;
            hasMore = true;
          } else {
            console.log(`   ✅ No meta found, got ${smsArray.length} SMS. Last page.`);
            hasMore = false;
          }
        }

        // Small delay to respect rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`📱 Total fetched: ${allSMS.length} SMS across ${page - 1} pages`);

      // Filter to only delivered SMS
      const deliveredSMS = allSMS.filter(sms => sms.status === 'delivered');

      console.log(`📱 Delivered SMS: ${deliveredSMS.length} / ${allSMS.length}`);

      // Normalize data
      const smsData = deliveredSMS.map(sms => ({
        id: sms.id,
        userId: parseInt(sms.userId),
        receiver: sms.receiver,
        timestamp: sms.timestamp,
        campaignId: sms.campaignId,
        leadId: sms.leadId,
        status: sms.status,
        syncedAt: new Date().toISOString()
      }));

      // Batch insert/update to PostgreSQL
      await db.batchInsertSMS(smsData.map(s => this.cacheToDb(s)));

      // Reload today's cache
      await this.loadTodayCache();

      this.lastSync = new Date().toISOString();

      console.log(`💾 Synced ${smsData.length} SMS to PostgreSQL`);

      return smsData;
    } catch (error) {
      console.error('❌ Error syncing SMS:', error.message);
      throw error;
    }
  }

  /**
   * Auto-sync if needed (every 2 minutes)
   */
  async needsSync() {
    if (!this.lastSync) {
      return true;
    }

    const lastSyncDate = new Date(this.lastSync);
    const minutesSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60);

    if (minutesSinceSync >= 2) {
      console.log(`⏰ Last SMS sync was ${Math.round(minutesSinceSync)} min ago - needs sync`);
      return true;
    }

    console.log(`✅ Last SMS sync was ${Math.round(minutesSinceSync)} min ago - cache is fresh`);
    return false;
  }

  async autoSync(adversusAPI) {
    await this._ensureInitialized();

    if (await this.needsSync()) {
      // If no previous sync → do full sync (rolling window)
      if (!this.lastSync) {
        console.log('⚠️  No SMS sync found - needs initial sync');
        return await this.syncSMS(adversusAPI);
      }

      // If previous sync exists → poll for new SMS only
      console.log('📱 Auto-syncing SMS (2 min passed)...');
      return await this.pollNewSMS(adversusAPI);
    }

    console.log('✅ Using cached SMS');
    return Array.from(this.todayCache.values());
  }

  async forceSync(adversusAPI) {
    console.log('🔄 FORCE SYNC SMS initiated from admin');
    return await this.syncSMS(adversusAPI);
  }

  /**
   * Get unique SMS count for an agent in a date range
   * Unique = distinct receiver per DATE (not per hour)
   * Example: 5 SMS to +46701234567 on 2025-11-02 = 1 unique SMS
   */
  async getUniqueSMSForAgent(userId, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const userIdNum = parseInt(userId);

    console.log(`🔍 getUniqueSMSForAgent: userId=${userIdNum}, ${start.toISOString()} → ${end.toISOString()}`);

    // Get SMS from cache or query DB
    const { start: todayStart, end: todayEnd } = this.getTodayWindow();

    // If query is entirely for today → use cache (fast in-memory counting)
    if (start >= todayStart && end <= todayEnd) {
      const agentSMS = Array.from(this.todayCache.values()).filter(sms => {
        const smsDate = new Date(sms.timestamp);
        return String(sms.userId) === String(userIdNum) &&
               smsDate >= start && smsDate <= end;
      });
      console.log(`   ✅ Found ${agentSMS.length} SMS in today's cache`);

      // Group by receiver + date (YYYY-MM-DD)
      const uniqueReceiverDates = new Set();
      agentSMS.forEach(sms => {
        const date = new Date(sms.timestamp).toISOString().split('T')[0];
        const key = `${sms.receiver}|${date}`;
        uniqueReceiverDates.add(key);
      });

      const result = uniqueReceiverDates.size;
      console.log(`   🎯 Returning uniqueSMS count: ${result}`);
      return result;
    } else {
      // Query PostgreSQL - COUNT directly in SQL (much faster!)
      console.log(`   📊 Query spans beyond today, using SQL COUNT...`);
      const result = await db.getUniqueSMSCountForUser(userIdNum, start, end);
      console.log(`   🎯 Returning uniqueSMS count from SQL: ${result}`);
      return result;
    }
  }

  /**
   * Get SMS success rate using pre-calculated dealCount
   *
   * @param {number|string} userId - User ID
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @param {number} dealCount - Already calculated deal count (with multiDeals)
   * @returns {Object} { uniqueSMS, successRate }
   */
  async getSMSSuccessRate(userId, startDate, endDate, dealCount) {
    const userIdNum = parseInt(userId);
    const uniqueSMS = await this.getUniqueSMSForAgent(userIdNum, startDate, endDate);
    const successRate = uniqueSMS > 0 ? (dealCount / uniqueSMS * 100) : 0;

    return {
      uniqueSMS,
      successRate: parseFloat(successRate.toFixed(2))
    };
  }

  /**
   * Get today's unique SMS count for an agent
   */
  async getTodayUniqueSMSForAgent(userId) {
    const { start, end } = this.getTodayWindow();
    return await this.getUniqueSMSForAgent(userId, start.toISOString(), end.toISOString());
  }

  /**
   * Get SMS in date range (from DB or cache)
   */
  async getSMSInRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const { start: todayStart, end: todayEnd } = this.getTodayWindow();

    // If query is entirely for today → use cache
    if (start >= todayStart && end <= todayEnd) {
      return Array.from(this.todayCache.values()).filter(sms => {
        const smsDate = new Date(sms.timestamp);
        return smsDate >= start && smsDate <= end;
      });
    }

    // Otherwise → query PostgreSQL
    const dbSMS = await db.getSMSInRange(start, end);
    return dbSMS.map(s => this.dbToCache(s));
  }

  /**
   * Get SMS for agent in date range
   */
  async getSMSForAgent(userId, startDate, endDate) {
    const userIdNum = parseInt(userId);
    const smsInRange = await this.getSMSInRange(startDate, endDate);
    return smsInRange.filter(sms =>
      String(sms.userId) === String(userIdNum)
    );
  }

  /**
   * Get stats
   */
  async getStats() {
    await this._ensureInitialized();

    const { startDate, endDate, startDateFormatted, endDateFormatted } = this.getRollingWindow();
    const allSMS = await db.getSMSInRange(new Date(startDate), new Date(endDate));

    // Count unique agents
    const uniqueAgents = new Set(allSMS.map(sms => sms.user_id));

    // Count by status
    const statusCounts = allSMS.reduce((acc, sms) => {
      acc[sms.status] = (acc[sms.status] || 0) + 1;
      return acc;
    }, {});

    // Calculate unique SMS
    const uniqueReceiverDates = new Set();
    allSMS.forEach(sms => {
      const date = new Date(sms.timestamp).toISOString().split('T')[0];
      const key = `${sms.receiver}_${date}`;
      uniqueReceiverDates.add(key);
    });

    return {
      totalSMS: allSMS.length,
      todaySMS: this.todayCache.size,
      uniqueSMS: uniqueReceiverDates.size,
      uniqueAgents: uniqueAgents.size,
      statusBreakdown: statusCounts,
      rollingWindow: `${startDateFormatted} to ${endDateFormatted}`,
      lastSync: this.lastSync || 'Never',
      needsSync: await this.needsSync(),
      retryQueueLength: this.retryQueue.length
    };
  }

  /**
   * Clean old SMS (no-op - DB keeps history)
   */
  async cleanOldSMS() {
    console.log('ℹ️  cleanOldSMS: PostgreSQL keeps all history');
    return { removed: 0, remaining: this.todayCache.size };
  }

  /**
   * Get last sync (for backward compatibility)
   */
  async getLastSync() {
    return {
      timestamp: this.lastSync || new Date(0).toISOString(),
      count: this.todayCache.size
    };
  }

  /**
   * Update last sync (for backward compatibility)
   */
  async updateLastSync() {
    this.lastSync = new Date().toISOString();
  }

  /**
   * Start scheduler to reset cache at midnight every day
   * This ensures "today's" cache is always current even if server runs 24/7
   */
  startMidnightScheduler() {
    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 1, 0); // 00:00:01 tomorrow

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      console.log(`🕐 Midnight SMS cache reset scheduled for ${tomorrow.toISOString()} (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);

      this.midnightTimer = setTimeout(async () => {
        console.log('🌙 MIDNIGHT: Resetting SMS cache for new day...');
        try {
          await this.loadTodayCache();
          console.log('✅ SMS cache reset complete for new day');
        } catch (error) {
          console.error('❌ Error resetting SMS cache at midnight:', error);
        }

        // Schedule next midnight reset
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    scheduleNextMidnight();
  }

  /**
   * Invalidate cache (reload from DB)
   */
  async invalidateCache() {
    console.log('🔄 Invalidating SMS cache, reloading from DB...');
    await this.loadTodayCache();
  }

  /**
   * Get cache property (for backward compatibility)
   */
  get cache() {
    return Array.from(this.todayCache.values());
  }
}

module.exports = new SMSCache();
