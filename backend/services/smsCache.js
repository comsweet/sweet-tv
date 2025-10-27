const fs = require('fs').promises;
const path = require('path');

/**
 * SMART SMS CACHE - INCREMENTAL UPDATES (RENDER PERSISTENT DISK)
 */
class SmsCache {
  constructor() {
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.cacheFile = path.join(this.dbPath, 'sms-cache.json');
    this.lastSyncFile = path.join(this.dbPath, 'sms-last-sync.json');
    
    console.log(`📱 SMS Cache path: ${this.dbPath} (isRender: ${isRender})`);
    
    this.incrementalInterval = 3 * 60 * 1000;
    this.fullSyncInterval = 24 * 60 * 60 * 1000;
    
    this.writeQueue = [];
    this.isProcessing = false;
    
    this.initCache();
  }

  async initCache() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.cacheFile);
        console.log('✅ sms-cache.json exists');
      } catch {
        await fs.writeFile(this.cacheFile, JSON.stringify({ sms: [] }, null, 2));
        console.log('📝 Created sms-cache.json');
      }

      try {
        await fs.access(this.lastSyncFile);
        console.log('✅ sms-last-sync.json exists');
      } catch {
        await fs.writeFile(this.lastSyncFile, JSON.stringify({ 
          lastSync: null,
          lastFullSync: null 
        }, null, 2));
        console.log('📝 Created sms-last-sync.json');
      }

      console.log('💾 SMS cache initialized on persistent disk');
    } catch (error) {
      console.error('Error initializing SMS cache:', error);
    }
  }

  async processWriteQueue() {
    if (this.isProcessing || this.writeQueue.length === 0) return;
    this.isProcessing = true;

    while (this.writeQueue.length > 0) {
      const operation = this.writeQueue.shift();
      try {
        await operation.execute();
        operation.resolve();
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
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      return JSON.parse(data).sms;
    } catch (error) {
      console.error('Error reading SMS cache:', error);
      return [];
    }
  }

  async _saveCache(sms) {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify({ sms }, null, 2));
    } catch (error) {
      console.error('Error saving SMS cache:', error);
      throw error;
    }
  }

  async saveCache(sms) {
    return this.queueWrite(async () => {
      await this._saveCache(sms);
    });
  }

  async getSyncInfo() {
    try {
      const data = await fs.readFile(this.lastSyncFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { lastSync: null, lastFullSync: null };
    }
  }

  async updateSyncInfo(isFullSync = false) {
    try {
      const syncInfo = await this.getSyncInfo();
      const now = new Date().toISOString();
      
      syncInfo.lastSync = now;
      if (isFullSync) {
        syncInfo.lastFullSync = now;
      }
      
      await fs.writeFile(this.lastSyncFile, JSON.stringify(syncInfo, null, 2));
    } catch (error) {
      console.error('Error updating sync info:', error);
    }
  }

  async fullSync(adversusAPI) {
    console.log('📱 FULL SYNC - Fetching all SMS from rolling window...');
    
    const { startDate, endDate } = this.getRollingWindow();
    console.log(`📅 Rolling window: ${startDate.toISOString()} → ${endDate.toISOString()}`);
    
    try {
      let allSms = [];
      let currentPage = 1;
      let hasMorePages = true;
      
      const filters = {
        lastModifiedTime: { $gte: startDate.toISOString() },
        status: { $eq: 'delivered' },
        type: { $eq: 'outbound' }
      };
      
      while (hasMorePages) {
        console.log(`   📄 Page ${currentPage}...`);
        
        const result = await adversusAPI.getSMS({
          filters: JSON.stringify(filters),
          page: currentPage,
          pageSize: 1000,
          includeMeta: true,
          sortProperty: 'lastModifiedTime',
          sortDirection: 'DESC'
        });
        
        const pageSms = result.sms || [];
        allSms = allSms.concat(pageSms);
        
        console.log(`   ✅ Page ${currentPage}: ${pageSms.length} SMS`);
        
        const meta = result.meta?.pagination;
        if (meta && currentPage < meta.pageCount) {
          currentPage++;
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          hasMorePages = false;
        }
      }
      
      console.log(`✅ FULL SYNC: ${allSms.length} SMS from ${currentPage} pages`);
      
      await this.saveCache(allSms);
      await this.updateSyncInfo(true);
      
      console.log(`💾 Saved to persistent disk: ${this.cacheFile}`);
      
      return allSms;
    } catch (error) {
      console.error('❌ Error in full sync:', error.message);
      throw error;
    }
  }

  async incrementalSync(adversusAPI) {
    console.log('🚀 INCREMENTAL SYNC - Fetching new SMS...');
    
    const syncInfo = await this.getSyncInfo();
    const lastSyncTime = syncInfo.lastSync ? new Date(syncInfo.lastSync) : new Date(Date.now() - 5 * 60 * 1000);
    const safeLastSync = new Date(lastSyncTime.getTime() - 30000);
    
    console.log(`   ⏰ Fetching SMS since ${safeLastSync.toISOString()}`);
    
    try {
      const filters = {
        lastModifiedTime: { $gte: safeLastSync.toISOString() },
        status: { $eq: 'delivered' },
        type: { $eq: 'outbound' }
      };
      
      const result = await adversusAPI.getSMS({
        filters: JSON.stringify(filters),
        page: 1,
        pageSize: 1000,
        sortProperty: 'lastModifiedTime',
        sortDirection: 'DESC'
      });
      
      const newSms = result.sms || [];
      
      if (newSms.length === 0) {
        console.log('   ℹ️  No new SMS');
        await this.updateSyncInfo(false);
        return [];
      }
      
      console.log(`   ✅ Found ${newSms.length} new SMS`);
      
      const existingSms = await this.getCache();
      const existingIds = new Set(existingSms.map(s => s.id));
      const uniqueNewSms = newSms.filter(sms => !existingIds.has(sms.id));
      
      if (uniqueNewSms.length > 0) {
        const updatedSms = [...uniqueNewSms, ...existingSms];
        
        const { startDate } = this.getRollingWindow();
        const validSms = updatedSms.filter(sms => {
          const smsDate = new Date(sms.lastModifiedTime);
          return smsDate >= startDate;
        });
        
        console.log(`   💾 Added ${uniqueNewSms.length} new SMS (${validSms.length} total in cache)`);
        
        await this.saveCache(validSms);
      } else {
        console.log('   ℹ️  All SMS already in cache');
      }
      
      await this.updateSyncInfo(false);
      
      return uniqueNewSms;
    } catch (error) {
      console.error('❌ Error in incremental sync:', error.message);
      throw error;
    }
  }

  async autoSync(adversusAPI) {
    const syncInfo = await this.getSyncInfo();
    const now = Date.now();
    
    if (!syncInfo.lastFullSync) {
      console.log('📱 No full sync found - doing full sync');
      return await this.fullSync(adversusAPI);
    }
    
    const lastFullSyncTime = new Date(syncInfo.lastFullSync).getTime();
    const hoursSinceFullSync = (now - lastFullSyncTime) / (1000 * 60 * 60);
    
    if (hoursSinceFullSync > 24) {
      console.log(`📱 Last full sync was ${Math.round(hoursSinceFullSync)}h ago - doing full sync`);
      return await this.fullSync(adversusAPI);
    }
    
    if (!syncInfo.lastSync) {
      return await this.incrementalSync(adversusAPI);
    }
    
    const lastSyncTime = new Date(syncInfo.lastSync).getTime();
    const minutesSinceSync = (now - lastSyncTime) / (1000 * 60);
    
    if (minutesSinceSync > 3) {
      console.log(`🚀 Last sync was ${Math.round(minutesSinceSync)} min ago - doing incremental sync`);
      return await this.incrementalSync(adversusAPI);
    }
    
    console.log(`✅ Cache is fresh (${Math.round(minutesSinceSync)} min old)`);
    return await this.getCache();
  }

  async getSmsInRange(startDate, endDate) {
    const allSms = await this.getCache();
    
    return allSms.filter(sms => {
      const smsDate = new Date(sms.lastModifiedTime);
      return smsDate >= startDate && smsDate <= endDate;
    });
  }

  // 🔥 FIXED: Return empty object instead of crashing when no SMS
  async getUniqueSmsPerAgent(startDate, endDate) {
    try {
      const allSms = await this.getSmsInRange(startDate, endDate);
      
      // 🔥 FIX: Return empty object if no SMS
      if (!allSms || allSms.length === 0) {
        console.log('   ℹ️  No SMS in date range - returning empty stats');
        return {};
      }
      
      const agentStats = {};
      
      allSms.forEach(sms => {
        if (!sms.userId) return;
        
        const receiver = sms.receivers && sms.receivers.length > 0 
          ? sms.receivers[0].receiver 
          : null;
        
        if (!receiver) return;
        
        const smsDate = new Date(sms.lastModifiedTime);
        const dateKey = smsDate.toISOString().split('T')[0];
        
        const uniqueKey = `${sms.userId}-${receiver}-${dateKey}`;
        
        if (!agentStats[sms.userId]) {
          agentStats[sms.userId] = {
            userId: sms.userId,
            uniqueSms: new Set(),
            totalSms: 0
          };
        }
        
        agentStats[sms.userId].uniqueSms.add(uniqueKey);
        agentStats[sms.userId].totalSms += 1;
      });
      
      Object.values(agentStats).forEach(stats => {
        stats.uniqueSmsCount = stats.uniqueSms.size;
        delete stats.uniqueSms;
      });
      
      return agentStats;
    } catch (error) {
      console.error('❌ Error in getUniqueSmsPerAgent:', error);
      return {}; // 🔥 Return empty object on error
    }
  }

  async forceFullSync(adversusAPI) {
    console.log('🔄 FORCE FULL SYNC initiated');
    return await this.fullSync(adversusAPI);
  }

  async getStats() {
    const sms = await this.getCache();
    const syncInfo = await this.getSyncInfo();
    const { startDate, endDate } = this.getRollingWindow();
    
    const uniqueAgents = new Set(sms.map(s => s.userId)).size;
    const uniqueStats = await this.getUniqueSmsPerAgent(startDate, endDate);
    const totalUniqueSms = Object.values(uniqueStats).reduce((sum, s) => sum + s.uniqueSmsCount, 0);
    
    return {
      totalSms: sms.length,
      totalUniqueSms: totalUniqueSms,
      lastSync: syncInfo.lastSync,
      lastFullSync: syncInfo.lastFullSync,
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
