const fs = require('fs').promises;
const path = require('path');

/**
 * PERSISTENT DEALS CACHE
 * 
 * 🔥🔥🔥 CRITICAL FIX: När needsImmediateSync = true, ANVÄND CACHE istället för att synka!
 * Detta förhindrar att manuellt tillagda deals försvinner när Adversus inte committat än.
 * 
 * Rolling window: Nuvarande månad + 7 dagar innan.
 */
class DealsCache {
  constructor() {
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.cacheFile = path.join(this.dbPath, 'deals-cache.json');
    this.lastSyncFile = path.join(this.dbPath, 'last-sync.json');

    console.log(`💾 Deals cache path: ${this.dbPath} (isRender: ${isRender})`);

    this.writeQueue = [];
    this.isProcessing = false;
    this.needsImmediateSync = false;

    // ⚡ IN-MEMORY CACHE: Prevents race conditions with writeQueue
    this.inMemoryCache = null;

    this.initCache();
  }

  async initCache() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.cacheFile);
      } catch {
        await fs.writeFile(this.cacheFile, JSON.stringify({ deals: [] }, null, 2));
      }

      try {
        await fs.access(this.lastSyncFile);
      } catch {
        await fs.writeFile(this.lastSyncFile, JSON.stringify({ lastSync: null }, null, 2));
      }

      console.log('💾 Deals cache initialized');
    } catch (error) {
      console.error('Error initializing deals cache:', error);
    }
  }

  async processWriteQueue() {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.writeQueue.length > 0) {
      const operation = this.writeQueue.shift();
      try {
        const result = await operation.execute();
        operation.resolve(result);  // 🔥 CRITICAL FIX: Propagate return value!
      } catch (error) {
        console.error('❌ Queue operation failed:', error);
        operation.reject(error);
      }
    }

    this.isProcessing = false;
  }

  async queueWrite(executeFn) {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({
        execute: executeFn,
        resolve,
        reject
      });
      this.processWriteQueue();
    });
  }

  getRollingWindow() {
    const now = new Date();
    
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return { startDate, endDate };
  }

  async getCache() {
    // ⚡ Return COPY of in-memory cache if available (prevents reference issues)
    if (this.inMemoryCache !== null) {
      return [...this.inMemoryCache];  // Return a copy, not the same reference!
    }

    // Otherwise, read from disk and populate in-memory cache
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(data);
      this.inMemoryCache = parsed.deals || [];
      return [...this.inMemoryCache];  // Return a copy
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 No cache file found, starting fresh');
        this.inMemoryCache = [];
        return [];
      }

      console.error('❌ Error reading cache:', error.message);
      console.error('🔧 Cache file corrupted, resetting to empty array');

      // If JSON is corrupted, backup the old file and start fresh
      try {
        const backupFile = `${this.cacheFile}.backup-${Date.now()}`;
        await fs.rename(this.cacheFile, backupFile);
        console.log(`💾 Backed up corrupted cache to: ${backupFile}`);
      } catch (backupError) {
        console.error('⚠️  Could not backup corrupted file:', backupError.message);
      }

      // Return empty array to start fresh
      this.inMemoryCache = [];
      return [];
    }
  }

  async _saveCache(deals) {
    try {
      // Write to disk for persistence
      // NOTE: Do NOT update in-memory cache here - it's already updated in addDeal()/saveCache()
      await fs.writeFile(this.cacheFile, JSON.stringify({ deals }, null, 2));
      console.log(`💾 Saved ${deals.length} deals to disk`);
    } catch (error) {
      console.error('Error saving cache:', error);
      throw error;
    }
  }

  async saveCache(deals) {
    // ⚡ Update in-memory cache IMMEDIATELY (synchronous)
    this.inMemoryCache = deals;

    // Then queue disk write (asynchronous)
    return this.queueWrite(async () => {
      await this._saveCache(deals);
    });
  }

  async getLastSync() {
    try {
      const data = await fs.readFile(this.lastSyncFile, 'utf8');
      return JSON.parse(data).lastSync;
    } catch (error) {
      return null;
    }
  }

  async updateLastSync() {
    try {
      await fs.writeFile(this.lastSyncFile, JSON.stringify({ 
        lastSync: new Date().toISOString() 
      }, null, 2));
    } catch (error) {
      console.error('Error updating last sync:', error);
    }
  }

  async addDeal(deal) {
    // ⚡ CRITICAL: Entire operation must be ATOMIC to prevent race conditions
    // Queue this operation so only ONE addDeal runs at a time
    // Also calculate previousTotal INSIDE the queue for atomicity
    return this.queueWrite(async () => {
      // Read current cache state INSIDE the queue (atomic read)
      const allDeals = await this.getCache();

      const exists = allDeals.find(d => d.leadId === deal.leadId);
      if (exists) {
        console.log('Deal already in cache, skipping:', deal.leadId);
        return null;
      }

      // Calculate previousTotal ATOMICALLY (before adding this deal)
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const todayDeals = allDeals.filter(d => {
        const dealDate = new Date(d.orderDate);
        return dealDate >= startOfDay &&
               dealDate <= endOfDay &&
               String(d.userId) === String(deal.userId);
      });

      const previousTotal = todayDeals.reduce((sum, d) => sum + parseFloat(d.commission || 0), 0);

      const newDeal = {
        leadId: deal.leadId,
        userId: deal.userId,
        campaignId: deal.campaignId,
        commission: parseFloat(deal.commission),
        multiDeals: deal.multiDeals || '0',
        orderDate: deal.orderDate,
        status: deal.status,
        syncedAt: new Date().toISOString()
      };

      // Update in-memory cache (atomic write)
      allDeals.push(newDeal);
      this.inMemoryCache = allDeals;

      const newTotal = previousTotal + newDeal.commission;

      console.log(`⚡ [ATOMIC] Deal ${deal.leadId} added: ${previousTotal.toFixed(2)} → ${newTotal.toFixed(2)} THB`);

      // Write to disk for persistence
      await this._saveCache(allDeals);

      // 🔥🔥🔥 CRITICAL: Flag to PREVENT sync (use cache instead!)
      this.needsImmediateSync = true;

      // 🔥 Auto-clear flag after 60 seconds (safety fallback)
      setTimeout(() => {
        if (this.needsImmediateSync) {
          console.log('⏰ Auto-clearing needsImmediateSync after 60s');
          this.needsImmediateSync = false;
        }
      }, 60000);

      console.log(`💾 Added deal ${newDeal.leadId} to cache (needsImmediateSync = true for 60s)`);

      // Return both the deal and the totals for atomic operation
      return {
        deal: newDeal,
        previousTotal,
        newTotal
      };
    });
  }

  async syncDeals(adversusAPI) {
    console.log('🔄 Syncing deals from Adversus...');
    
    const { startDate, endDate } = this.getRollingWindow();
    console.log(`📅 Rolling window: ${startDate.toISOString()} → ${endDate.toISOString()}`);
    
    try {
      const result = await adversusAPI.getLeadsInDateRange(startDate, endDate);
      const leads = result.leads || [];
      
      console.log(`✅ Fetched ${leads.length} leads from Adversus`);
      
      const deals = leads.map(lead => {
        const commissionField = lead.resultData?.find(f => f.id === 70163);
        const commission = parseFloat(commissionField?.value || 0);
        
        let multiDeals = '1';
        
        const resultMultiDeals = lead.resultData?.find(f => f.id === 74126);
        if (resultMultiDeals?.value) {
          multiDeals = resultMultiDeals.value;
        } else {
          const masterMultiDeals = lead.masterData?.find(f => 
            f.label?.toLowerCase().includes('multideal') || 
            f.label?.toLowerCase().includes('multi deal') ||
            f.label?.toLowerCase().includes('antal deals') ||
            f.id === 74126
          );
          
          if (masterMultiDeals?.value) {
            multiDeals = masterMultiDeals.value;
          }
        }
        
        const orderDateField = lead.resultData?.find(f => f.label === 'Order date');
        
        return {
          leadId: lead.id,
          userId: lead.lastContactedBy,
          campaignId: lead.campaignId,
          commission: commission,
          multiDeals: multiDeals,
          orderDate: orderDateField?.value || lead.lastUpdatedTime,
          status: lead.status,
          syncedAt: new Date().toISOString()
        };
      });
      
      const dealsWithCommission = deals.filter(deal => deal.commission > 0);
      const dealsWithMultiple = deals.filter(deal => parseInt(deal.multiDeals) > 1);
      
      await this.saveCache(deals);
      await this.updateLastSync();
      
      // Clear flag after successful sync
      this.needsImmediateSync = false;
      
      console.log(`💾 Cached ${deals.length} deals total`);
      console.log(`   - ${dealsWithCommission.length} deals WITH commission`);
      console.log(`   - ${deals.length - dealsWithCommission.length} deals WITHOUT commission`);
      console.log(`   - ${dealsWithMultiple.length} deals WITH multiDeals > 1 🎯`);
      
      return deals;
    } catch (error) {
      console.error('❌ Error syncing deals:', error.message);
      throw error;
    }
  }

  async getDealsInRange(startDate, endDate) {
    const allDeals = await this.getCache();
    
    return allDeals.filter(deal => {
      const dealDate = new Date(deal.orderDate);
      return dealDate >= startDate && dealDate <= endDate;
    });
  }

  // 🔥🔥🔥 CRITICAL FIX: När needsImmediateSync = true, synka INTE!
  async needsSync() {
    if (this.needsImmediateSync) {
      console.log('🔥 needsImmediateSync = true - SKIPPING sync (using cache)');
      return false;  // ← VIKTIGT: Don't sync!
    }
    
    const lastSync = await this.getLastSync();
    
    if (!lastSync) {
      console.log('⚠️  No sync found - needs initial sync');
      return true;
    }
    
    const lastSyncDate = new Date(lastSync);
    const minutesSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60);
    
    if (minutesSinceSync >= 2) {
      console.log(`⏰ Last sync was ${Math.round(minutesSinceSync)} min ago - needs sync`);
      return true;
    }
    
    console.log(`✅ Last sync was ${Math.round(minutesSinceSync)} min ago - cache is fresh`);
    return false;
  }

  async autoSync(adversusAPI) {
    if (await this.needsSync()) {
      return await this.syncDeals(adversusAPI);
    }
    
    console.log('✅ Using cached deals');
    return await this.getCache();
  }

  async forceSync(adversusAPI) {
    console.log('🔄 FORCE SYNC initiated from admin');
    return await this.syncDeals(adversusAPI);
  }

  async cleanOldDeals() {
    return this.queueWrite(async () => {
      const { startDate } = this.getRollingWindow();
      const allDeals = await this.getCache();
      
      const validDeals = allDeals.filter(deal => {
        const dealDate = new Date(deal.orderDate);
        return dealDate >= startDate;
      });
      
      if (validDeals.length < allDeals.length) {
        const removed = allDeals.length - validDeals.length;
        await this._saveCache(validDeals);
        console.log(`🗑️  Cleaned ${removed} old deals outside rolling window`);
      }
    });
  }

  async getStats() {
    const deals = await this.getCache();
    const lastSync = await this.getLastSync();
    const { startDate, endDate } = this.getRollingWindow();
    
    return {
      totalDeals: deals.length,
      lastSync: lastSync,
      needsImmediateSync: this.needsImmediateSync,
      rollingWindow: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      totalCommission: deals.reduce((sum, d) => sum + d.commission, 0),
      uniqueAgents: new Set(deals.map(d => d.userId)).size,
      queueLength: this.writeQueue.length
    };
  }

  async getTodayTotalForAgent(userId) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    const allDeals = await this.getCache();
    const todayDeals = allDeals.filter(deal => {
      const dealDate = new Date(deal.orderDate);
      return dealDate >= startOfDay && 
             dealDate <= endOfDay && 
             String(deal.userId) === String(userId);
    });
    
    const total = todayDeals.reduce((sum, deal) => sum + parseFloat(deal.commission || 0), 0);
    console.log(`📊 Today's total for agent ${userId}: ${total} THB (from ${todayDeals.length} deals in cache)`);
    return total;
  }

  async getTodayDealsForAgent(userId) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    const allDeals = await this.getCache();
    return allDeals.filter(deal => {
      const dealDate = new Date(deal.orderDate);
      return dealDate >= startOfDay && 
             dealDate <= endOfDay && 
             String(deal.userId) === String(userId);
    });
  }
}

module.exports = new DealsCache();
