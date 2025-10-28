// backend/services/pollingService.js
const adversusAPI = require('./adversusAPI');
const database = require('./database');
const soundSettings = require('./soundSettings');
const soundLibrary = require('./soundLibrary');
const leaderboardCache = require('./leaderboardCache');
const dealsCache = require('./dealsCache');
const smsCache = require('./smsCache');
const notificationSettings = require('./notificationSettings');

class PollingService {
  constructor(io) {
    this.io = io;
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 15000;
    this.lastCheckTime = new Date(Date.now() - 60000);
    this.isPolling = false;
    
    // Pending deals queue
    this.pendingDeals = new Map();
    this.maxRetries = 10;
    this.retryDelay = 15000;
    
    // Track vilka deals vi redan skickat notifikationer för
    this.notifiedLeads = new Set();
    
    // Rensa notifiedLeads varje timme
    setInterval(() => {
      console.log(`🧹 Clearing notifiedLeads cache (${this.notifiedLeads.size} entries)`);
      this.notifiedLeads.clear();
    }, 60 * 60 * 1000);
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
      
      // 1️⃣ KOLLA PENDING DEALS FÖRST
      await this.checkPendingDeals();
      
      // 2️⃣ HÄMTA NYA SUCCESS LEADS
      const result = await adversusAPI.getSuccessLeads(this.lastCheckTime);
      const newLeads = result.leads || [];
      
      if (newLeads.length > 0) {
        console.log(`✅ Found ${newLeads.length} new success leads`);
        
        for (const lead of newLeads) {
          await this.processDeal(lead);
        }
      }
      
      this.lastCheckTime = new Date();
      
    } catch (error) {
      console.error('Error polling for deals:', error);
    }
  }

  async checkPendingDeals() {
    if (this.pendingDeals.size === 0) return;
    
    console.log(`🔄 Checking ${this.pendingDeals.size} pending deals...`);
    
    const toRemove = [];
    
    for (const [leadId, pendingData] of this.pendingDeals.entries()) {
      pendingData.attempts++;
      
      if (pendingData.attempts > this.maxRetries) {
        console.log(`⏭️  Giving up on lead ${leadId} after ${this.maxRetries} attempts`);
        toRemove.push(leadId);
        continue;
      }
      
      console.log(`♻️  Retry ${pendingData.attempts}/${this.maxRetries} for lead ${leadId}`);
      
      try {
        const leadResponse = await adversusAPI.getLeadById(leadId);
        const lead = leadResponse.leads?.[0];
        
        if (lead) {
          const commissionField = lead.resultData?.find(f => f.id === 70163);
          const commission = parseFloat(commissionField?.value || '0');
          
          if (commission > 0) {
            console.log(`✅ Lead ${leadId} now has commission: ${commission} THB`);
            toRemove.push(leadId);
            await this.processDeal(lead, true);
          }
        }
      } catch (error) {
        console.error(`❌ Error checking pending lead ${leadId}:`, error.message);
      }
    }
    
    for (const leadId of toRemove) {
      this.pendingDeals.delete(leadId);
    }
  }

  async processDeal(lead, fromPending = false) {
    try {
      // Hitta commission
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const multiDealsField = lead.resultData?.find(f => f.label === 'MultiDeals');
      const orderDateField = lead.resultData?.find(f => f.label === 'Order date');

      const commission = commissionField?.value || '0';
      const commissionValue = parseFloat(commission);
      
      // Om ingen commission, lägg i pending queue
      if (commissionValue === 0 || !commissionField?.value) {
        if (!this.pendingDeals.has(lead.id)) {
          console.log(`⏳ Lead ${lead.id} has no commission yet - adding to pending queue`);
          this.pendingDeals.set(lead.id, {
            lead: lead,
            attempts: 1,
            firstSeen: Date.now()
          });
        }
        return;
      }

      const deal = {
        leadId: lead.id,
        userId: lead.lastContactedBy,
        campaignId: lead.campaignId,
        commission: commission,
        multiDeals: multiDealsField?.value || '0',
        orderDate: orderDateField?.value || lead.lastUpdatedTime,
        status: lead.status
      };
      
      // Kolla om vi redan skickat notification för denna lead
      const alreadyNotified = this.notifiedLeads.has(lead.id);
      
      if (alreadyNotified) {
        console.log(`⏭️  Lead ${lead.id} already notified, skipping notification`);
        return;
      }
      
      // Hämta dagens total INNAN vi lägger till
      const previousTotal = await dealsCache.getTodayTotalForAgent(deal.userId);
      const newTotal = previousTotal + commissionValue;
      
      // Spara till persistent cache
      const savedDeal = await dealsCache.addDeal(deal);
      
      // 🔥 FIX: INVALIDERA IN-MEMORY CACHE så silent refresh får färsk data!
      leaderboardCache.clear();
      console.log('🗑️  Cleared in-memory cache - silent refresh will now get fresh data');
      
      // Hämta agent info
      const agent = await database.getAgent(deal.userId);
      
      // Kolla notification settings
      const notifSettings = await notificationSettings.getSettings();
      if (!notifSettings.enabled) {
        console.log('🔕 Notifications disabled - skipping');
        this.notifiedLeads.add(lead.id);
        return;
      }
      
      // Kolla milestone
      let soundType = 'normal';
      let soundUrl = null;
      
      const milestones = [50000, 40000, 30000, 20000, 10000, 5000, 3000];
      const passedMilestone = milestones.find(m => previousTotal < m && newTotal >= m);
      
      if (passedMilestone) {
        soundType = 'milestone';
        console.log(`🎉 MILESTONE! ${agent?.name || deal.userId} reached ${passedMilestone} THB!`);
        
        const soundLib = await soundLibrary.getSounds();
        soundUrl = soundLib.milestone || 'https://res.cloudinary.com/dmr8kbj04/video/upload/v1761585396/sweet-tv-sounds/sound-ta-ching-7053.mp3';
      } else {
        // Agent custom sound eller default
        if (agent?.preferCustomSound && agent?.customSound) {
          soundUrl = agent.customSound;
        } else {
          const settings = await soundSettings.getSettings();
          soundUrl = settings.defaultSound || 'https://res.cloudinary.com/dmr8kbj04/video/upload/v1761585396/sweet-tv-sounds/sound-ta-ching-7053.mp3';
        }
      }
      
      const notification = {
        agent: {
          id: deal.userId,
          name: agent?.name || `Agent ${deal.userId}`
        },
        commission: commissionValue,
        totalToday: newTotal,
        soundType: soundType,
        soundUrl: soundUrl,
        timestamp: new Date().toISOString()
      };
      
      console.log(`🔊 Emitting notification: ${notification.agent.name} - ${commissionValue} THB (Total: ${newTotal} THB)`);
      this.io.emit('newDeal', notification);
      
      // Markera som notifierad
      this.notifiedLeads.add(lead.id);
      console.log(`✅ Marked lead ${lead.id} as notified`);
      
    } catch (error) {
      console.error(`❌ Error processing deal ${lead.id}:`, error.message);
      console.error('Stack trace:', error.stack);
    }
  }

  cleanupOldPendingDeals() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    let cleaned = 0;
    
    for (const [leadId, pendingData] of this.pendingDeals.entries()) {
      if (pendingData.firstSeen < fiveMinutesAgo) {
        console.log(`🗑️  Cleaning up old pending deal ${leadId} (> 5 min old)`);
        this.pendingDeals.delete(leadId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🗑️  Cleaned ${cleaned} old pending deals`);
    }
  }

  async checkNow() {
    return await this.poll();
  }

  getPendingStatus() {
    const pending = [];
    for (const [leadId, data] of this.pendingDeals.entries()) {
      pending.push({
        leadId: leadId,
        attempts: data.attempts,
        waitingSeconds: Math.round((Date.now() - data.firstSeen) / 1000)
      });
    }
    return pending;
  }
}

module.exports = PollingService;
