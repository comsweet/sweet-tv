const fs = require('fs').promises;
const path = require('path');

/**
 * PERSISTENT DEALS CACHE
 * 
 * Sparar alla success leads i en fil istället för att hämta från Adversus varje gång.
 * Rolling window: Nuvarande månad + 7 dagar innan.
 * 
 * Exempel:
 * - 24 november → Cachar: 24 okt - 30 nov
 * - 1 november → Cachar: 25 okt - 30 nov
 * 
 * Benefits:
 * - Drastiskt färre API calls
 * - Snabbare leaderboards
 * - "Denna vecka" fungerar alltid (även över månadsskifte)
 */
class DealsCache {
  constructor() {
    this.dbPath = path.join(__dirname, '../data');
    this.cacheFile = path.join(this.dbPath, 'deals-cache.json');
    this.lastSyncFile = path.join(this.dbPath, 'last-sync.json');
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

  // Läs cache
  async getCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      return JSON.parse(data).deals;
    } catch (error) {
      console.error('Error reading cache:', error);
      return [];
    }
  }

  // Skriv cache
  async saveCache(deals) {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify({ deals }, null, 2));
      console.log(`💾 Saved ${deals.length} deals to cache`);
    } catch (error) {
      console.error('Error saving cache:', error);
    }
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

  // 🔥 NY METOD: Lägg till en enskild deal (för polling)
  async addDeal(deal) {
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
    await this.saveCache(allDeals);
    console.log(`💾 Added deal ${newDeal.leadId} to cache`);
    return newDeal;
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
      }).filter(deal => deal.commission > 0); // Bara deals med commission
      
      // Spara till cache
      await this.saveCache(deals);
      await this.updateLastSync();
      
      console.log(`💾 Cached ${deals.length} deals (filtered ${leads.length - deals.length} without commission)`);
      
      return deals;
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

  // Kolla om sync behövs
  async needsSync() {
    const lastSync = await this.getLastSync();
    
    if (!lastSync) {
      console.log('⚠️  No sync found - needs initial sync');
      return true;
    }
    
    const lastSyncDate = new Date(lastSync);
    const hoursSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60);
    
    // Sync var 6:e timme
    if (hoursSinceSync > 6) {
      console.log(`⏰ Last sync was ${Math.round(hoursSinceSync)}h ago - needs sync`);
      return true;
    }
    
    console.log(`✅ Last sync was ${Math.round(hoursSinceSync)}h ago - cache is fresh`);
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
    const { startDate } = this.getRollingWindow();
    const allDeals = await this.getCache();
    
    const validDeals = allDeals.filter(deal => {
      const dealDate = new Date(deal.orderDate);
      return dealDate >= startDate;
    });
    
    if (validDeals.length < allDeals.length) {
      const removed = allDeals.length - validDeals.length;
      await this.saveCache(validDeals);
      console.log(`🗑️  Cleaned ${removed} old deals outside rolling window`);
    }
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
      uniqueAgents: new Set(deals.map(d => d.userId)).size
    };
  }

  // Get today's total commission for agent (FROM CACHE!)
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

  // Get today's deals for agent (FROM CACHE!)
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
