// backend/services/smsCache.js
// 🔥 UPDATED VERSION - 2-minute sync interval + Type-safe userId comparisons
// 🔥 FIXED: Persistent disk path for Render deployment
const fs = require('fs').promises;
const path = require('path');

class SMSCache {
  constructor() {
    // 🔥 KRITISK FIX: Persistent disk på Render!
    const isRender = process.env.RENDER === 'true';
    
    const dbPath = isRender 
      ? '/var/data'  // Render persistent disk
      : path.join(__dirname, '../data');  // Local development
    
    this.cacheFile = path.join(dbPath, 'sms-cache.json');
    this.lastSyncFile = path.join(dbPath, 'sms-last-sync.json');
    
    console.log(`📱 SMS cache path: ${dbPath} (isRender: ${isRender})`);
    
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
      const maxPages = 20; // Safety limit to prevent infinite loops

      while (hasMore && page <= maxPages) {
        const result = await adversusAPI.getSMS(filters, page, 1000);
        const smsArray = result.sms || [];
        
        allSMS = [...allSMS, ...smsArray];
        
        console.log(`📱 Fetched page ${page}: ${smsArray.length} SMS`);
        
        // 🔍 DEBUG: Log pagination info
        const meta = result.meta;
        if (meta && meta.pagination) {
          console.log(`   📊 Pagination: page ${meta.pagination.page}/${meta.pagination.pageCount}, total: ${meta.pagination.total}`);
          hasMore = meta.pagination.page < meta.pagination.pageCount;
          page++;
        } else {
          // 🔥 FIX: If no meta, check if we got a full page (1000 SMS)
          // If we got exactly 1000, there might be more pages
          if (smsArray.length === 1000) {
            console.log(`   ⚠️  No meta found, but got full page (1000 SMS). Fetching next page...`);
            page++;
            hasMore = true;
          } else {
            console.log(`   ✅ No meta found, got ${smsArray.length} SMS (< 1000). Assuming last page.`);
            hasMore = false;
          }
        }
        
        // Small delay to respect rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (page > maxPages) {
        console.log(`⚠️  Reached max pages limit (${maxPages}). There might be more SMS.`);
      }

      console.log(`📱 Total fetched: ${allSMS.length} SMS across ${page - 1} pages`);

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
    const minutesSinceSync = (now - lastSyncTime) / (1000 * 60);

    return minutesSinceSync >= 2; // 🔥 UPDATED: Sync every 2 minutes (was 6 hours)
  }

  async autoSync(adversusAPI) {
    await this._ensureInitialized(); // 🔥 Auto-init
    
    if (await this.needsSync()) {
      console.log('📱 Auto-syncing SMS (2 min passed)...');
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

    // 🔥 FIX: Convert userId to number for consistency
    const userIdNum = parseInt(userId);

    // Filter SMS for this agent in date range
    // 🔥 FIX: Type-safe comparison using String()
    const agentSMS = this.cache.filter(sms => {
      const smsDate = new Date(sms.timestamp);
      return String(sms.userId) === String(userIdNum) && 
             smsDate >= start && 
             smsDate <= end;
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
   * Success rate = (totalDeals / uniqueSMS) * 100
   * 
   * @deprecated Use getSMSSuccessRate instead for better performance
   */
  async getSMSStatsForAgent(userId, startDate, endDate, dealsCache) {
    await this._ensureInitialized(); // 🔥 Auto-init
    
    // 🔥 FIX: Convert userId to number for consistency
    const userIdNum = parseInt(userId);
    
    const uniqueSMS = this.getUniqueSMSForAgent(userIdNum, startDate, endDate);
    
    // Get deals count for same period
    const deals = await dealsCache.getDealsInRange(startDate, endDate);
    
    // 🔥 FIX: Type-safe comparison using String()
    const agentDeals = deals.filter(deal => {
      return String(deal.userId) === String(userIdNum);
    });
    
    // 🐛 DEBUG: Log when no match is found
    if (deals.length > 0 && agentDeals.length === 0) {
      console.log(`⚠️  SMS Stats: Found ${deals.length} total deals but 0 for user ${userIdNum}`);
      console.log(`   Sample deal userId: "${deals[0].userId}" (type: ${typeof deals[0].userId})`);
      console.log(`   Looking for userId: ${userIdNum} (type: ${typeof userIdNum})`);
    } else if (agentDeals.length > 0) {
      console.log(`✅ SMS Stats: Found ${agentDeals.length} deals for user ${userIdNum}`);
    }
    
    // Calculate total deals (including multiDeals)
    const totalDeals = agentDeals.reduce((sum, deal) => {
      const multiDeals = parseInt(deal.multiDeals) || 1;
      return sum + multiDeals;
    }, 0);

    // Calculate success rate with 2 decimals
    const successRate = uniqueSMS > 0 ? (totalDeals / uniqueSMS * 100) : 0;

    // 🐛 DEBUG: Log result
    console.log(`📊 SMS Stats for user ${userIdNum}: uniqueSMS=${uniqueSMS}, totalDeals=${totalDeals}, rate=${successRate.toFixed(2)}%`);

    return {
      uniqueSMS,
      totalDeals,
      successRate: parseFloat(successRate.toFixed(2)) // Format: 33.33
    };
  }

  /**
   * ✅ NEW: Calculate SMS success rate using pre-calculated dealCount
   * This is simpler and avoids fetching deals again from cache
   * 
   * @param {number|string} userId - User ID
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @param {number} dealCount - Already calculated deal count (with multiDeals)
   * @returns {Object} { uniqueSMS, successRate }
   */
  getSMSSuccessRate(userId, startDate, endDate, dealCount) {
    const userIdNum = parseInt(userId);
    const uniqueSMS = this.getUniqueSMSForAgent(userIdNum, startDate, endDate);
    const successRate = uniqueSMS > 0 ? (dealCount / uniqueSMS * 100) : 0;
    
    console.log(`📊 SMS Success Rate for user ${userIdNum}: ${dealCount} deals / ${uniqueSMS} SMS = ${successRate.toFixed(2)}%`);

    return {
      uniqueSMS,
      successRate: parseFloat(successRate.toFixed(2))
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
    // 🔥 FIX: Type-safe comparison
    const userIdNum = parseInt(userId);
    return this.getSMSInRange(startDate, endDate).filter(sms => {
      return String(sms.userId) === String(userIdNum);
    });
  }
}

module.exports = new SMSCache();
