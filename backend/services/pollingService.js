// backend/services/pollingService.js
const adversusAPI = require('./adversusAPI');
const database = require('./database');
const soundSettings = require('./soundSettings');
const soundLibrary = require('./soundLibrary');
const leaderboardCache = require('./leaderboardCache');
const dealsCache = require('./dealsCache');
const smsCache = require('./smsCache'); // 🔥 FIX: Lägg till smsCache
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
    
    // 🔥 NY: Track vilka deals vi redan skickat notifikationer för
    this.notifiedLeads = new Set();
    
    // 🔥 NY: Rensa notifiedLeads varje timme
    setInterval(() => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      console.log(`🧹 Clearing notifiedLeads cache (${this.notifiedLeads.size} entries)`);
      this.notifiedLeads.clear();
    }, 60 * 60 * 1000); // En timme
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
      
      // 🔥 FIX: Kolla om vi redan skickat notification för denna lead
      const alreadyNotified = this.notifiedLeads.has(lead.id);
      
      if (alreadyNotified) {
        console.log(`⏭️  Lead ${lead.id} already notified, skipping notification`);
        return;
      }
      
      // Hämta dagens total INNAN vi lägger till
      const previousTotal = await dealsCache.getTodayTotalForAgent(deal.userId);
      const newTotal = previousTotal + commissionValue;
      
      // Försök spara till cache (kan returnera null om redan finns)
      const savedDeal = await dealsCache.addDeal(deal);
      
      // 🔥 FIX: Skicka notification ÄVEN om dealen redan fanns i cache
      // (men bara om vi inte redan skickat notification för den)
      
      if (savedDeal) {
        // Ny deal i cache - invalidera cache och logga
        console.log('🗑️  Invalidating all leaderboard caches after new deal');
        leaderboardCache.clear();
        
        // 🔥 FIX: SYNKA SMS DIREKT efter ny deal för att få uppdaterad SMS%
        try {
          console.log('📱 Syncing SMS after new deal (incremental sync)...');
          await smsCache.syncSms(adversusAPI, false); // false = incremental (bara sista 3 min)
          console.log('✅ SMS synced successfully');
        } catch (smsError) {
          console.error('⚠️  Failed to sync SMS, but continuing:', smsError.message);
        }
        
        if (fromPending) {
          console.log(`🎉 PENDING DEAL PROCESSED: Lead ${lead.id} finally has commission!`);
        }
      } else {
        console.log(`ℹ️  Lead ${lead.id} already in cache, but will send notification anyway`);
      }
      
      // 🔥 NY LOGIK: Skicka notification OAVSETT om savedDeal är null
      // Hämta agent-info
      let agent = await database.getAgent(deal.userId);
      
      // Om agent inte finns lokalt, hämta från Adversus
      if (!agent) {
        try {
          const userResponse = await adversusAPI.getUser(deal.userId);
          const adversusUser = userResponse.users?.[0];
          
          if (adversusUser) {
            agent = await database.addAgent({
              userId: deal.userId,
              name: adversusUser.name || 
                    `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                    `Agent ${deal.userId}`,
              email: adversusUser.email || '',
              customSound: null,
              preferCustomSound: false
            });
          }
        } catch (userError) {
          console.error(`⚠️  Could not fetch user ${deal.userId}:`, userError.message);
        }
      }
      
      // Kolla dagsbudget för milestones
      const settings = await notificationSettings.getSettings();
      const dailyBudget = settings.dailyBudget || 3400;
      
      let soundType = 'agent';
      let soundUrl = null;
      
      // Milestone check
      if (previousTotal < dailyBudget && newTotal >= dailyBudget) {
        console.log(`🏆 MILESTONE: ${agent?.name || deal.userId} reached daily budget (${dailyBudget} THB)!`);
        soundType = 'milestone';
        
        const soundLib = await soundLibrary.getLibrary();
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
      
      // 🔥 VIKTIGT: Markera som notifierad
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
