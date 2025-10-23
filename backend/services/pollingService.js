const adversusAPI = require('./adversusAPI');
const database = require('./database');

class PollingService {
  constructor(io) {
    this.io = io;
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 30000;
    this.lastCheckTime = new Date(Date.now() - 60000); // Börja 1 minut bakåt
    this.isPolling = false;
    this.userCache = new Map(); // Cache för user-info
    this.lastUserListFetch = null; // När vi senast hämtade user-listan
  }

  start() {
    console.log(`🔄 Starting polling (${this.pollInterval}ms interval)`);
    this.isPolling = true;
    
    // Hämta user-lista direkt vid start
    this.refreshUserCache();
    
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
    
    // Refresh user cache varje 5 minuter
    this.userCacheInterval = setInterval(() => this.refreshUserCache(), 300000);
  }

  stop() {
    console.log('⏸️  Stopping polling');
    this.isPolling = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.userCacheInterval) {
      clearInterval(this.userCacheInterval);
    }
  }

  async refreshUserCache() {
    try {
      console.log('📡 Refreshing user cache from Adversus...');
      const usersResponse = await adversusAPI.getUsers();
      const users = usersResponse.users || [];
      
      // Populate cache
      users.forEach(user => {
        const userInfo = {
          userId: user.id,
          name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || `Agent ${user.id}`,
          email: user.email || ''
        };
        this.userCache.set(user.id, userInfo);
      });
      
      this.lastUserListFetch = new Date();
      console.log(`✅ User cache refreshed with ${users.length} users`);
    } catch (error) {
      console.error('❌ Error refreshing user cache:', error.message);
    }
  }

  getUserInfo(userId) {
    // Check cache first
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }

    // Fallback if not in cache
    console.log(`⚠️  User ${userId} not in cache, using fallback name`);
    return {
      userId: userId,
      name: `Agent ${userId}`,
      email: ''
    };
  }

  async poll() {
    if (!this.isPolling) return;

    try {
      console.log('🔍 Polling for new deals...');
      
      // Hämta leads med status "success"
      const result = await adversusAPI.getSuccessLeads(this.lastCheckTime);
      const newLeads = result.leads || [];
      
      if (newLeads.length > 0) {
        console.log(`✅ Found ${newLeads.length} new success leads`);
        
        for (const lead of newLeads) {
          // Hitta commission från resultData (id 70163)
          const commissionField = lead.resultData?.find(f => f.id === 70163);
          const multiDealsField = lead.masterData?.find(f => f.id === 74126);
          const orderDateField = lead.resultData?.find(f => f.label === 'Order date');

          const deal = {
            leadId: lead.id,
            userId: lead.lastContactedBy,
            campaignId: lead.campaignId,
            commission: commissionField?.value || '0',
            multiDeals: multiDealsField?.value || '1',
            orderDate: orderDateField?.value || lead.lastUpdatedTime,
            status: lead.status
          };
          
          // Spara dealen
          const savedDeal = await database.addDeal(deal);
          
          if (savedDeal) {
            // Hämta agent-info (check local first, then cache)
            let agent = await database.getAgent(deal.userId);
            
            if (!agent || !agent.name || agent.name === `Agent ${deal.userId}`) {
              // Get from cache (no API call!)
              const userInfo = this.getUserInfo(deal.userId);
              
              // Save/update in local database
              agent = await database.addAgent({
                userId: userInfo.userId,
                name: userInfo.name,
                email: userInfo.email,
                profileImage: agent?.profileImage || null
              });
              
              console.log(`📝 Updated agent info for ${userInfo.name}`);
            }
            
            // Skicka notifikation via WebSocket
            const notification = {
              deal: savedDeal,
              agent: {
                userId: agent.userId,
                name: agent.name,
                email: agent.email || '',
                profileImage: agent.profileImage || null
              },
              commission: deal.commission,
              timestamp: new Date().toISOString()
            };
            
            this.io.emit('new_deal', notification);
            console.log(`🎉 New deal notification sent for ${notification.agent.name}`);
          }
        }
      }
      
      // Uppdatera last check time
      this.lastCheckTime = new Date();
      
    } catch (error) {
      console.error('❌ Error during polling:', error.message);
      
      if (error.message === 'RATE_LIMIT_EXCEEDED') {
        console.log('⏳ Rate limit hit, backing off...');
        this.stop();
        setTimeout(() => this.start(), 60000);
      }
    }
  }

  async checkNow() {
    return await this.poll();
  }

  // Clear user cache (for re-sync)
  async clearCache() {
    this.userCache.clear();
    console.log('🧹 User cache cleared');
    await this.refreshUserCache();
  }
}

module.exports = PollingService;
