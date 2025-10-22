const adversusAPI = require('./adversusAPI');
const database = require('./database');

class PollingService {
  constructor(io) {
    this.io = io;
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 30000;
    this.lastCheckTime = new Date(Date.now() - 60000); // Börja 1 minut bakåt
    this.isPolling = false;
  }

  start() {
    console.log(`🔄 Starting polling (${this.pollInterval}ms interval)`);
    this.isPolling = true;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop() {
    console.log('⏸️  Stopping polling');
    this.isPolling = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
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
          const multiDealsField = lead.resultData?.find(f => f.label === 'MultiDeals');
          const orderDateField = lead.resultData?.find(f => f.label === 'Order date');

          const deal = {
            leadId: lead.id,
            userId: lead.lastContactedBy,
            campaignId: lead.campaignId,
            commission: commissionField?.value || '0',
            multiDeals: multiDealsField?.value || '0',
            orderDate: orderDateField?.value || lead.lastUpdatedTime,
            status: lead.status
          };
          
          // Spara dealen
          const savedDeal = await database.addDeal(deal);
          
          if (savedDeal) {
            // Hämta agent-info
            const agent = await database.getAgent(deal.userId);
            
            // Skicka notifikation via WebSocket
            const notification = {
              deal: savedDeal,
              agent: agent || {
                userId: deal.userId,
                name: `Agent ${deal.userId}`,
                profileImage: null
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
}

module.exports = PollingService;
