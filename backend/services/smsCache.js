// backend/services/smsCache.js
const fs = require('fs').promises;
const path = require('path');

class SMSCache {
  constructor() {
    this.cacheFile = path.join(__dirname, '../data/sms-cache.json');
    this.lastSyncFile = path.join(__dirname, '../data/sms-last-sync.json');
    this.cache = [];
    this.writeQueue = [];
    this.isProcessing = false;
    this.initialized = false;
    
    // 🔥 Auto-initialize on first use
    this._initPromise = null;
  }

  // ==================== INITIALIZATION ====================

  async _ensureInitialized() {
    if (this.initialized) return;
    
    if (!this._initPromise) {
      this._initPromise = this._doInit();
    }
    
    await this._initPromise;
  }

  async _doInit() {
    try {
      await this.loadCache();
      this.initialized = true;
      console.log('📱 SMS Cache initialized');
    } catch (error) {
      console.error('❌ Error initializing SMS cache:', error.message);
      this.cache = [];
      this.initialized = true; // Mark as initialized even on error
    }
  }

  async init() {
    await this._ensureInitialized();
  }

  async loadCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      this.cache = JSON.parse(data);
      console.log(`📱 Loaded ${this.cache.length} SMS from cache`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📱 No SMS cache found, starting fresh');
        this.cache = [];
        await this.saveCache([]);
      } else {
        throw error;
      }
    }
  }

  // ==================== ROLLING WINDOW ====================

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

  // ==================== WRITE QUEUE ====================

  async queueWrite(executeFn) {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ execute: executeFn, resolve, reject });
      this.processWriteQueue();
    });
  }

  async processWriteQueue() {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const { execute, resolve, reject } = this.writeQueue.shift();

    try {
      const result = await execute();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      if (this.writeQueue.length > 0) {
        this.processWriteQueue();
      }
    }
  }

  async saveCache(smsArray) {
    return this.queueWrite(async () => {
      await fs.writeFile(this.cacheFile, JSON.stringify(smsArray, null, 2));
      this.cache = smsArray;
      return smsArray;
    });
  }

  // ==================== SYNC FROM ADVERSUS ====================

  async syncSMS(adversusAPI) {
    await this._ensureInitialized(); // 🔥 Auto-init
    
    try {
      const { startDate, endDate, startDateFormatted, endDateFormatted } = this.getRollingWindow();
      
      console.log(`📱 Syncing SMS from ${startDateFormatted} to ${endDateFormatted}`);

      // Build filters (NO status filter - not supported by API!)
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

      while (hasMore) {
        const result = await adversusAPI.getSMS(filters, page, 1000);
        const smsArray = result.sms || [];
        
        allSMS = [...allSMS, ...smsArray];
        
        console.log(`📱 Fetched page ${page}: ${smsArray.length} SMS`);
        
        // Check if there are more pages
        const meta = result.meta;
        if (meta && meta.pagination) {
          hasMore = meta.pagination.page < meta.pagination.pageCount;
          page++;
        } else {
          hasMore = false;
        }
      }

      console.log(`📱 Total fetched: ${allSMS.length} SMS`);

      // Filter to only delivered SMS (do it in code since API doesn't support status filter)
      const deliveredSMS = allSMS.filter(sms => sms.status === 'delivered');
      
      console.log(`📱 Delivered SMS: ${deliveredSMS.length} / ${allSMS.length}`);

      // Transform to our format
      const smsData = deliveredSMS.map(sms => ({
        id: sms.id,
        userId: sms.userId,
        receiver: sms.receiver,
        timestamp: sms.timestamp,
        campaignId: sms.campaignId,
        leadId: sms.leadId,
        status: sms.status,
        syncedAt: new Date().toISOString()
      }));

      // Save to cache
      await this.saveCache(smsData);
      await this.updateLastSync();

      console.log(`💾 Cached ${smsData.length} delivered SMS`);

      return smsData;
    } catch (error) {
      console.error('❌ Error syncing SMS:', error.message);
      throw error;
    }
  }

  // ==================== LAST SYNC TRACKING ====================

  async updateLastSync() {
    const lastSync = {
      timestamp: new Date().toISOString(),
      count: this.cache.length
    };
    await fs.writeFile(this.lastSyncFile, JSON.stringify(lastSync, null, 2));
  }

  async getLastSync() {
    try {
      const data = await fs.readFile(this.lastSyncFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async needsSync() {
    const lastSync = await this.getLastSync();
    if (!lastSync) return true;

    const lastSyncTime = new Date(lastSync.timestamp);
    const now = new Date();
    const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

    return hoursSinceSync >= 6; // Sync every 6 hours
  }

  async autoSync(adversusAPI) {
    await this._ensureInitialized(); // 🔥 Auto-init
    
    if (await this.needsSync()) {
      console.log('📱 Auto-syncing SMS...');
      return await this.syncSMS(adversusAPI);
    }
    return this.cache;
  }

  // ==================== UNIQUE SMS COUNTING ====================

  /**
   * Get unique SMS count for an agent in a date range
   * Unique = distinct receiver per DATE (not per day-hour)
   * Example: 5 SMS to +46701234567 on 2025-10-28 = 1 unique SMS
   */
  getUniqueSMSForAgent(userId, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Filter SMS for this agent in date range
    const agentSMS = this.cache.filter(sms => {
      const smsDate = new Date(sms.timestamp);
      return sms.userId === userId && smsDate >= start && smsDate <= end;
    });

    // Group by receiver + date (YYYY-MM-DD)
    const uniqueReceiverDates = new Set();
    
    agentSMS.forEach(sms => {
      const date = new Date(sms.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
      const key = `${sms.receiver}|${date}`;
      uniqueReceiverDates.add(key);
    });

    return uniqueReceiverDates.size;
  }

  /**
   * Get SMS stats for an agent (unique SMS + success rate)
   * Success rate = (deals / unique SMS) * 100
   */
  async getSMSStatsForAgent(userId, startDate, endDate, dealsCache) {
    await this._ensureInitialized(); // 🔥 Auto-init
    
    const uniqueSMS = this.getUniqueSMSForAgent(userId, startDate, endDate);
    
    // Get deals count for same period
    const deals = await dealsCache.getDealsInRange(startDate, endDate);
    const agentDeals = deals.filter(deal => deal.userId === userId);
    
    // Calculate total deals (including multiDeals)
    const totalDeals = agentDeals.reduce((sum, deal) => {
      const multiDeals = parseInt(deal.multiDeals) || 1;
      return sum + multiDeals;
    }, 0);

    // Calculate success rate with 2 decimals
    const successRate = uniqueSMS > 0 ? (totalDeals / uniqueSMS * 100) : 0;

    return {
      uniqueSMS,
      totalDeals,
      successRate: parseFloat(successRate.toFixed(2)) // Format: 33.33
    };
  }

  /**
   * Get today's unique SMS count for an agent
   */
  getTodayUniqueSMSForAgent(userId) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    return this.getUniqueSMSForAgent(userId, startOfDay.toISOString(), endOfDay.toISOString());
  }

  // ==================== STATS & MAINTENANCE ====================

  async getStats() {
    await this._ensureInitialized(); // 🔥 Auto-init
    
    const lastSync = await this.getLastSync();
    const { startDateFormatted, endDateFormatted } = this.getRollingWindow();

    // Count unique agents
    const uniqueAgents = new Set(this.cache.map(sms => sms.userId));

    // Count by status
    const statusCounts = this.cache.reduce((acc, sms) => {
      acc[sms.status] = (acc[sms.status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalSMS: this.cache.length,
      uniqueAgents: uniqueAgents.size,
      statusBreakdown: statusCounts,
      rollingWindow: `${startDateFormatted} to ${endDateFormatted}`,
      lastSync: lastSync ? lastSync.timestamp : 'Never',
      needsSync: await this.needsSync()
    };
  }

  async cleanOldSMS() {
    const { startDate } = this.getRollingWindow();
    const startTime = new Date(startDate);

    const filtered = this.cache.filter(sms => {
      return new Date(sms.timestamp) >= startTime;
    });

    const removed = this.cache.length - filtered.length;
    
    if (removed > 0) {
      await this.saveCache(filtered);
      console.log(`🧹 Cleaned ${removed} old SMS outside rolling window`);
    }

    return { removed, remaining: filtered.length };
  }

  async forceSync(adversusAPI) {
    console.log('🔄 Force syncing SMS...');
    return await this.syncSMS(adversusAPI);
  }

  // ==================== QUERY HELPERS ====================

  getSMSInRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return this.cache.filter(sms => {
      const smsDate = new Date(sms.timestamp);
      return smsDate >= start && smsDate <= end;
    });
  }

  getSMSForAgent(userId, startDate, endDate) {
    return this.getSMSInRange(startDate, endDate).filter(sms => sms.userId === userId);
  }
}

module.exports = new SMSCache();
