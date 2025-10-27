const fs = require('fs').promises;
const path = require('path');

/**
 * PERSISTENT SMS CACHE - FINAL VERSION
 * 
 * ✅ Använder "timestamp" fält
 * ✅ Läser från response.sms (inte response.data)
 * ✅ Filtrerar på type via API
 * ✅ Filtrerar på status i BACKEND (stöds inte av API)
 * 
 * Valid API filter properties enligt Swagger:
 * 'type', 'timestamp', 'sender', 'receiver', 'userId', 'leadId', 'campaignId'
 * 
 * INTE STÖDS: 'status' (måste filtreras i backend)
 */
class SmsCache {
  constructor() {
    this.dbPath = path.join(__dirname, '../data');
    this.cacheFile = path.join(this.dbPath, 'sms-cache.json');
    this.lastSyncFile = path.join(this.dbPath, 'sms-last-sync.json');
    this.lastFullSyncFile = path.join(this.dbPath, 'sms-last-full-sync.json');
    
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
        await fs.writeFile(this.cacheFile, JSON.stringify({ sms: [] }, null, 2));
      }

      // Skapa last sync files
      try {
        await fs.access(this.lastSyncFile);
      } catch {
        await fs.writeFile(this.lastSyncFile, JSON.stringify({ lastSync: null }, null, 2));
      }

      try {
        await fs.access(this.lastFullSyncFile);
      } catch {
        await fs.writeFile(this.lastFullSyncFile, JSON.stringify({ lastFullSync: null }, null, 2));
      }

      console.log('📱 SMS cache initialized');
    } catch (error) {
      console.error('Error initializing SMS cache:', error);
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
        console.error('❌ SMS Queue operation failed:', error);
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

  // Beräkna rolling window dates (samma som deals)
  getRollingWindow() {
    const now = new Date();
    
    // Start: 7 dagar innan månadsskifte
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    
    // End: Sista dagen nuvarande månad
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return { startDate, endDate };
  }

  // Läs cache
  async getCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      return JSON.parse(data).sms;
    } catch (error) {
      console.error('Error reading SMS cache:', error);
      return [];
    }
  }

  // Skriv cache (private)
  async _saveCache(sms) {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify({ sms }, null, 2));
      console.log(`💾 Saved ${sms.length} SMS to cache`);
    } catch (error) {
      console.error('Error saving SMS cache:', error);
      throw error;
    }
  }

  // Public save (uses queue)
  async saveCache(sms) {
    return this.queueWrite(async () => {
      await this._saveCache(sms);
    });
  }

  // Läs last sync times
  async getLastSync() {
    try {
      const data = await fs.readFile(this.lastSyncFile, 'utf8');
      return JSON.parse(data).lastSync;
    } catch (error) {
      return null;
    }
  }

  async getLastFullSync() {
    try {
      const data = await fs.readFile(this.lastFullSyncFile, 'utf8');
      return JSON.parse(data).lastFullSync;
    } catch (error) {
      return null;
    }
  }

  // Uppdatera last sync times
  async updateLastSync() {
    try {
      await fs.writeFile(this.lastSyncFile, JSON.stringify({ 
        lastSync: new Date().toISOString() 
      }, null, 2));
    } catch (error) {
      console.error('Error updating SMS last sync:', error);
    }
  }

  async updateLastFullSync() {
    try {
      await fs.writeFile(this.lastFullSyncFile, JSON.stringify({ 
        lastFullSync: new Date().toISOString() 
      }, null, 2));
    } catch (error) {
      console.error('Error updating SMS last full sync:', error);
    }
  }

  // Sync SMS från Adversus
  async syncSms(adversusAPI, forceFullSync = false) {
    console.log('📱 Syncing SMS from Adversus...');
    
    const { startDate, endDate } = this.getRollingWindow();
    console.log(`📅 Rolling window: ${startDate.toISOString()} → ${endDate.toISOString()}`);
    
    try {
      let allSms = [];
      const existingSms = await this.getCache();
      
      if (forceFullSync || existingSms.length === 0) {
        // FULL SYNC: Hämta ALLA outbound SMS i rolling window
        console.log('🔄 Full sync - fetching outbound SMS...');
        
        // ✅ FIXAT: Filtrera bara på type och timestamp (status stöds inte)
        const filters = {
          "timestamp": { 
            "$gt": startDate.toISOString(),
            "$lt": endDate.toISOString()
          },
          "type": { "$eq": "outbound" }
          // NOTERA: status filtreras i backend (stöds inte av API)
        };
        
        allSms = await this._paginatedFetch(adversusAPI, filters);
        
        // ✅ Filtrera på status i BACKEND
        console.log(`🔍 Filtering ${allSms.length} SMS on status="delivered" in backend...`);
        allSms = allSms.filter(sms => sms.status === 'delivered');
        console.log(`✅ ${allSms.length} SMS with status="delivered"`);
        
        await this.updateLastFullSync();
      } else {
        // INCREMENTAL SYNC: Hämta bara nya SMS (sista 3 minuter)
        console.log('⚡ Incremental sync - fetching SMS from last 3 minutes...');
        
        const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
        
        const filters = {
          "timestamp": { 
            "$gt": threeMinAgo.toISOString(),
            "$lt": endDate.toISOString()
          },
          "type": { "$eq": "outbound" }
        };
        
        let newSms = await this._paginatedFetch(adversusAPI, filters);
        
        // Filtrera på status i backend
        newSms = newSms.filter(sms => sms.status === 'delivered');
        
        // Merge med existing (undvik dubbletter)
        const existingIds = new Set(existingSms.map(s => s.id));
        const uniqueNewSms = newSms.filter(s => !existingIds.has(s.id));
        
        allSms = [...existingSms, ...uniqueNewSms];
        
        console.log(`✅ Added ${uniqueNewSms.length} new SMS (${existingSms.length} existing)`);
      }
      
      // Rensa gamla SMS (utanför rolling window)
      const validSms = allSms.filter(sms => {
        const smsDate = new Date(sms.timestamp);
        return smsDate >= startDate && smsDate <= endDate;
      });
      
      if (validSms.length < allSms.length) {
        console.log(`🗑️  Removed ${allSms.length - validSms.length} old SMS outside rolling window`);
      }
      
      // Spara
      await this.saveCache(validSms);
      await this.updateLastSync();
      
      console.log(`📱 SMS Cache updated: ${validSms.length} total SMS (outbound + delivered)\n`);
      
      return validSms;
    } catch (error) {
      console.error('❌ Error syncing SMS:', error.message);
      throw error;
    }
  }

  // Paginerad fetch (Adversus har 1000 per sida max)
  async _paginatedFetch(adversusAPI, filters) {
    let allSms = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        console.log(`📱 Fetching SMS (page ${page}, pageSize 1000)...`);
        console.log('   Filters:', JSON.stringify(filters, null, 2));
        
        const response = await adversusAPI.getSms({
          page: page,
          pageSize: 1000,
          filters: filters,
          includeMeta: true
        });
        
        const sms = response.data || [];
        allSms = allSms.concat(sms);
        
        console.log(`   ✅ Got ${sms.length} SMS (total: ${allSms.length})`);
        
        // Kolla om det finns fler sidor
        if (response.meta && response.meta.pagination) {
          hasMore = response.meta.pagination.page < response.meta.pagination.pageCount;
          page++;
        } else {
          hasMore = false;
        }
        
        // Safety: Max 50 pages (50,000 SMS)
        if (page > 50) {
          console.log('⚠️  Reached max page limit (50)');
          break;
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${page}:`, error.message);
        throw error;
      }
    }
    
    console.log(`   ✅ Fetched ${allSms.length} total SMS\n`);
    
    return allSms;
  }

  // Auto-sync (incremental var 3:e minut)
  async autoSync(adversusAPI) {
    const lastSync = await this.getLastSync();
    
    if (!lastSync) {
      console.log('⚠️  No SMS sync found - doing full sync');
      return await this.syncSms(adversusAPI, true);
    }
    
    const lastSyncDate = new Date(lastSync);
    const minutesSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60);
    
    if (minutesSinceSync > 3) {
      console.log(`⏰ Last SMS sync was ${Math.round(minutesSinceSync)} min ago - syncing`);
      return await this.syncSms(adversusAPI, false);
    }
    
    console.log(`✅ Using cached SMS (last sync ${Math.round(minutesSinceSync)} min ago)`);
    return await this.getCache();
  }

  // Force sync (från admin)
  async forceSync(adversusAPI) {
    console.log('🔄 FORCE SMS SYNC initiated from admin');
    return await this.syncSms(adversusAPI, true);
  }

  // Clear cache
  async clearCache() {
    await this.saveCache([]);
    console.log('🧹 SMS cache cleared');
  }

  // 📊 HUVUDFUNKTION: Räkna UNIKA SMS per agent
  async getUniqueSmsPerAgent(startDate, endDate) {
    const allSms = await this.getCache();
    
    // Filtrera på datum
    const smsInRange = allSms.filter(sms => {
      const smsDate = new Date(sms.timestamp);
      return smsDate >= startDate && smsDate <= endDate;
    });
    
    // Gruppera per agent
    const agentStats = {};
    
    smsInRange.forEach(sms => {
      const userId = String(sms.userId);
      const phoneNumber = sms.receiver;
      
      if (!agentStats[userId]) {
        agentStats[userId] = {
          uniquePhoneNumbers: new Set(),
          totalSms: 0
        };
      }
      
      agentStats[userId].uniquePhoneNumbers.add(phoneNumber);
      agentStats[userId].totalSms++;
    });
    
    // Konvertera till objekt
    const result = {};
    Object.keys(agentStats).forEach(userId => {
      result[userId] = {
        uniqueSmsCount: agentStats[userId].uniquePhoneNumbers.size,
        totalSms: agentStats[userId].totalSms
      };
    });
    
    return result;
  }

  // Stats
  async getStats() {
    const sms = await this.getCache();
    const lastSync = await this.getLastSync();
    const lastFullSync = await this.getLastFullSync();
    const { startDate, endDate } = this.getRollingWindow();
    
    // Räkna unique SMS
    const uniquePhoneNumbers = new Set(sms.map(s => s.receiver)).size;
    const uniqueAgents = new Set(sms.map(s => s.userId)).size;
    
    return {
      totalSms: sms.length,
      totalUniqueSms: uniquePhoneNumbers,
      lastSync: lastSync,
      lastFullSync: lastFullSync,
      storagePath: this.dbPath,
      rollingWindow: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      uniqueAgents: uniqueAgents,
      queueLength: this.writeQueue.length
    };
  }
}

module.exports = new SmsCache();
