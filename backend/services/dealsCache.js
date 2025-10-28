const fs = require('fs').promises;
const path = require('path');

/**
 * PERSISTENT DEALS CACHE
 * 
 * Rolling window: 7 dagar innan månadsskifte → sista dagen i nuvarande månad
 * 
 * ✅ AUTO-SYNC: Synkar var 5:e minut (tidigare 6 timmar) 
 * ✅ Queue system för att undvika race conditions
 * ✅ Persistent disk storage på Render
 */
class DealsCache {
  constructor() {
    // 🔥 PERSISTENT DISK på Render!
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'  // Render persistent disk
      : path.join(__dirname, '../data'); // Local development
    
    this.cacheFile = path.join(this.dbPath, 'deals-cache.json');
    this.lastSyncFile = path.join(this.dbPath, 'deals-last-sync.json');
    
    console.log(`💾 Deals Cache path: ${this.dbPath} (isRender: ${isRender})`);
    
    // Queue för concurrent writes
    this.writeQueue = [];
    this.isProcessing = false;
    
    this.initCache();
  }

  async initCache() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa cache file
      try {
        await fs.access(this.cacheFile);
      } catch {
        await fs.writeFile(this.cacheFile, JSON.stringify({ deals: [] }, null, 2));
      }

      // Skapa last sync file
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

  // Process write queue
  async processWriteQueue() {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.writeQueue.length > 0) {
      const operation = this.writeQueue.shift();
      try {
        await operation.execute();
        operation.resolve();
      } catch (error) {
        console.error('❌ Deals Queue operation failed:', error);
        operation.reject(error);
      }
    }

    this.isProcessing = false;
  }

  // Queue a write operation
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

  // Beräkna rolling window dates
  getRollingWindow() {
    const now = new Date();
    
    // Start: 7 dagar innan månadsskifte
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setDate(startDate.getDate() - 7); // 7 dagar bakåt från månadsskifte
    startDate.setHours(0, 0, 0, 0);
    
    // End: Sista dagen nästa månad (för att få hela nuvarande månad)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return { startDate, endDate };
  }

  // Läs cache (read operations är säkra utan queue)
  async getCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      return JSON.parse(data).deals;
    } catch (error) {
      console.error('Error reading cache:', error);
      return [];
    }
  }

  // Skriv cache (private - använd bara via queue!)
  async _saveCache(deals) {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify({ deals }, null, 2));
      console.log(`💾 Saved ${deals.length} deals to cache`);
    } catch (error) {
      console.error('Error saving cache:', error);
      throw error;
    }
  }

  // Public save method (uses queue)
  async saveCache(deals) {
    return this.queueWrite(async () => {
      await this._saveCache(deals);
    });
  }

  // Läs last sync time
  async getLastSync() {
    try {
      const data = await fs.readFile(this.lastSyncFile, 'utf8');
      return JSON.parse(data).lastSync;
    } catch (error) {
      return null;
    }
  }

  // Uppdatera last sync time
  async updateLastSync() {
    try {
      await fs.writeFile(this.lastSyncFile, JSON.stringify({ 
        lastSync: new Date().toISOString() 
      }, null, 2));
    } catch (error) {
      console.error('Error updating last sync:', error);
    }
  }

  // 🔥 UPPDATERAD: Queue-safe add deal
  async addDeal(deal) {
    return this.queueWrite(async () => {
      // Read fresh data inside queue operation
      const allDeals = await this.getCache();
      
      // Undvik dubbletter
      const exists = allDeals.find(d => d.leadId === deal.leadId);
      if (exists) {
        console.log('Deal already in cache, skipping:', deal.leadId);
        return null;
      }
      
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
      
      allDeals.push(newDeal);
      await this._saveCache(allDeals); // Direct write (already in queue)
      console.log(`💾 Added deal ${newDeal.leadId} to cache`);
      return newDeal;
    });
  }

  // Sync deals från Adversus
  async syncDeals(adversusAPI) {
    console.log('🔄 Syncing deals from Adversus...');
    
    const { startDate, endDate } = this.getRollingWindow();
    console.log(`📅 Rolling window: ${startDate.toISOString()} → ${endDate.toISOString()}`);
    
    try {
      // Hämta alla leads från Adversus i rolling window
      const result = await adversusAPI.getLeadsInDateRange(startDate, endDate);
      const leads = result.leads || [];
      
      console.log(`✅ Fetched ${leads.length} leads from Adversus`);
      
      // Konvertera till vårt format
      const deals = leads.map(lead => {
        const commissionField = lead.resultData?.find(f => f.id === 70163);
        const multiDealsField = lead.resultData?.find(f => f.label === 'MultiDeals');
        const orderDateField = lead.resultData?.find(f => f.label === 'Order date');
        
        return {
          leadId: lead.id,
          userId: lead.lastContactedBy,
          campaignId: lead.campaignId,
          commission: parseFloat(commissionField?.value || 0),
          multiDeals: multiDealsField?.value || '0',
          orderDate: orderDateField?.value || lead.lastUpdatedTime,
          status: lead.status,
          syncedAt: new Date().toISOString()
        };
      });
      
      // Filtrera bara deals MED commission (annars blir cachen full av pending deals)
      const dealsWithCommission = deals.filter(deal => deal.commission > 0);
      
      console.log(`💾 Caching ${dealsWithCommission.length} deals WITH commission`);
      console.log(`   Skipping ${deals.length - dealsWithCommission.length} deals WITHOUT commission`);
      
      // Spara bara deals med commission
      await this.saveCache(dealsWithCommission); // Uses queue
      await this.updateLastSync();
      
      console.log(`✅ Deals sync complete\n`);
      
      return dealsWithCommission;
    } catch (error) {
      console.error('❌ Error syncing deals:', error.message);
      throw error;
    }
  }

  // Hämta deals för en period (från cache!)
  async getDealsInRange(startDate, endDate) {
    const allDeals = await this.getCache();
    
    return allDeals.filter(deal => {
      const dealDate = new Date(deal.orderDate);
      return dealDate >= startDate && dealDate <= endDate;
    });
  }

  // 🔥 UPPDATERAD: Kolla om sync behövs (NU 5 MINUTER ISTÄLLET FÖR 6 TIMMAR!)
  async needsSync() {
    const lastSync = await this.getLastSync();
    
    if (!lastSync) {
      console.log('⚠️  No sync found - needs initial sync');
      return true;
    }
    
    const lastSyncDate = new Date(lastSync);
    const minutesSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60);
    
    // 🔥 ÄNDRAT: Sync var 5:e minut (tidigare 6 timmar)
    if (minutesSinceSync > 5) {
      console.log(`⏰ Last sync was ${Math.round(minutesSinceSync)} min ago - needs sync`);
      return true;
    }
    
    console.log(`✅ Last sync was ${Math.round(minutesSinceSync)} min ago - cache is fresh`);
    return false;
  }

  // Auto-sync om nödvändigt
  async autoSync(adversusAPI) {
    if (await this.needsSync()) {
      return await this.syncDeals(adversusAPI);
    }
    
    console.log('✅ Using cached deals');
    return await this.getCache();
  }

  // Force sync (från admin)
  async forceSync(adversusAPI) {
    console.log('🔄 FORCE SYNC initiated from admin');
    return await this.syncDeals(adversusAPI);
  }

  // Clean old deals (utanför rolling window)
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
        await this._saveCache(validDeals); // Direct write (already in queue)
        console.log(`🗑️  Cleaned ${removed} old deals outside rolling window`);
      }
    });
  }

  // Stats
  async getStats() {
    const deals = await this.getCache();
    const lastSync = await this.getLastSync();
    const { startDate, endDate } = this.getRollingWindow();
    
    return {
      totalDeals: deals.length,
      lastSync: lastSync,
      rollingWindow: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      totalCommission: deals.reduce((sum, d) => sum + d.commission, 0),
      uniqueAgents: new Set(deals.map(d => d.userId)).size,
      queueLength: this.writeQueue.length
    };
  }

  // Get today's total commission for agent (FROM CACHE!)
  async getTodayTotalForAgent(userId) {
    const deals = await this.getCache();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDeals = deals.filter(deal => {
      if (deal.userId !== userId) return false;
      
      const dealDate = new Date(deal.orderDate);
      return dealDate >= today;
    });
    
    return todayDeals.reduce((sum, deal) => sum + deal.commission, 0);
  }
}

module.exports = new DealsCache();
