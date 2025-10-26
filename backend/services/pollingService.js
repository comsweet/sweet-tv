const adversusAPI = require('./adversusAPI');
const database = require('./database');
const soundSettings = require('./soundSettings');
const soundLibrary = require('./soundLibrary');
const leaderboardCache = require('./leaderboardCache');
const dealsCache = require('./dealsCache'); // 🔥 IMPORT PERSISTENT DEALS CACHE!

class PollingService {
  constructor(io) {
    this.io = io;
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 15000;
    this.lastCheckTime = new Date(Date.now() - 60000); // Börja 1 minut bakåt
    this.isPolling = false;
    
    // 🔥 NY: Pending deals queue för deals som väntar på commission
    this.pendingDeals = new Map(); // { leadId: { lead, attempts, firstSeen } }
    this.maxRetries = 10; // Max 10 försök = ~2.5 minuter (15s * 10)
    this.retryDelay = 15000; // Samma som pollInterval
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
      
      // 1️⃣ KOLLA PENDING DEALS FÖRST (deals som väntar på commission)
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
      
      // 3️⃣ RENSA GAMLA PENDING DEALS (> 5 minuter gamla)
      this.cleanupOldPendingDeals();
      
      // Uppdatera last check time
      this.lastCheckTime = new Date();
      
      // Log pending deals status
      if (this.pendingDeals.size > 0) {
        console.log(`⏳ ${this.pendingDeals.size} deals waiting for commission`);
      }
      
    } catch (error) {
      console.error('❌ Error during polling:', error.message);
      
      if (error.message === 'RATE_LIMIT_EXCEEDED') {
        console.log('⏳ Rate limit hit, backing off...');
        this.stop();
        setTimeout(() => this.start(), 60000);
      }
    }
  }

  async checkPendingDeals() {
    if (this.pendingDeals.size === 0) return;
    
    console.log(`🔄 Checking ${this.pendingDeals.size} pending deals...`);
    
    const toProcess = [];
    const toRemove = [];
    
    for (const [leadId, pendingData] of this.pendingDeals.entries()) {
      const { lead, attempts, firstSeen } = pendingData;
      
      // Hämta uppdaterad lead info från Adversus
      try {
        const response = await adversusAPI.request(`/leads/${leadId}`);
        const updatedLead = response.leads?.[0];
        
        if (!updatedLead) {
          console.log(`⚠️  Lead ${leadId} not found, removing from pending`);
          toRemove.push(leadId);
          continue;
        }
        
        // Kolla om commission nu är ifylld
        const commissionField = updatedLead.resultData?.find(f => f.id === 70163);
        const commissionValue = parseFloat(commissionField?.value || 0);
        
        if (commissionValue > 0) {
          console.log(`✅ Lead ${leadId} now has commission (${commissionValue} THB) after ${attempts} attempts!`);
          toProcess.push(updatedLead);
          toRemove.push(leadId);
        } else {
          // Fortfarande ingen commission
          if (attempts >= this.maxRetries) {
            const ageMinutes = Math.round((Date.now() - firstSeen) / 60000);
            console.log(`⏭️  Lead ${leadId} still no commission after ${attempts} attempts (${ageMinutes} min) - giving up`);
            toRemove.push(leadId);
          } else {
            // Öka attempt counter
            this.pendingDeals.set(leadId, {
              ...pendingData,
              attempts: attempts + 1
            });
            console.log(`⏳ Lead ${leadId} still waiting... (attempt ${attempts + 1}/${this.maxRetries})`);
          }
        }
      } catch (error) {
        console.error(`❌ Error checking pending lead ${leadId}:`, error.message);
        
        // Om för många attempts, ta bort
        if (attempts >= this.maxRetries) {
          toRemove.push(leadId);
        }
      }
    }
    
    // Process leads som nu har commission
    for (const lead of toProcess) {
      await this.processDeal(lead, true); // true = från pending queue
    }
    
    // Ta bort processed/failed leads
    for (const leadId of toRemove) {
      this.pendingDeals.delete(leadId);
    }
  }

  async processDeal(lead, fromPending = false) {
    // Hitta commission från resultData (id 70163)
    const commissionField = lead.resultData?.find(f => f.id === 70163);
    const multiDealsField = lead.resultData?.find(f => f.label === 'MultiDeals');
    const orderDateField = lead.resultData?.find(f => f.label === 'Order date');

    const commission = commissionField?.value || '0';
    const commissionValue = parseFloat(commission);
    
    // 🔥 NY LOGIK: Om ingen commission, lägg i pending queue
    if (commissionValue === 0 || !commissionField?.value) {
      // Kolla om redan i pending
      if (!this.pendingDeals.has(lead.id)) {
        console.log(`⏳ Lead ${lead.id} has no commission yet - adding to pending queue`);
        this.pendingDeals.set(lead.id, {
          lead: lead,
          attempts: 1,
          firstSeen: Date.now()
        });
      }
      return; // Vänta tills nästa polling cycle
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
    
    // 🔥 UPPDATERAD: Använd dealsCache istället för database för korrekt dailyTotal!
    const previousTotal = await dealsCache.getTodayTotalForAgent(deal.userId);
    const newTotal = previousTotal + commissionValue;
    
    // Spara dealen
    const savedDeal = await database.addDeal(deal);
    
    if (savedDeal) {
      // 🔥 CRITICAL FIX: INVALIDATE LEADERBOARD CACHE!
      console.log('🗑️  Invalidating all leaderboard caches after new deal');
      leaderboardCache.clear();
      
      // 🔥 NEW FIX: ADD TO PERSISTENT DEALS CACHE!
      try {
        const allDeals = await dealsCache.getCache();
        allDeals.push({
          leadId: deal.leadId,
          userId: deal.userId,
          campaignId: deal.campaignId,
          commission: parseFloat(deal.commission),
          multiDeals: deal.multiDeals,
          orderDate: deal.orderDate,
          status: deal.status,
          syncedAt: new Date().toISOString()
        });
        await dealsCache.saveCache(allDeals);
        console.log('💾 Added new deal to persistent deals cache');
      } catch (cacheError) {
        console.error('⚠️  Could not add deal to persistent cache:', cacheError.message);
      }
      
      // Log om det kom från pending queue
      if (fromPending) {
        console.log(`🎉 PENDING DEAL PROCESSED: Lead ${lead.id} finally has commission!`);
      }
      
      // Hämta agent-info
      let agent = await database.getAgent(deal.userId);
      
      // Om agent inte finns lokalt, försök hämta från Adversus
      if (!agent) {
        try {
          const userResponse = await adversusAPI.getUser(deal.userId);
          const adversusUser = userResponse.users?.[0];
          
          if (adversusUser) {
            agent = {
              userId: deal.userId,
              name: adversusUser.name || 
                    `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                    null,
              email: adversusUser.email || '',
              profileImage: null,
              customSound: null,
              preferCustomSound: false
            };
            
            // Spara agent för framtida lookups
            if (agent.name) {
              await database.addAgent(agent);
            }
          }
        } catch (error) {
          console.error(`⚠️  Could not fetch user ${deal.userId}:`, error.message);
        }
      }
      
      // Skicka notifikation ENDAST om vi har en giltig agent
      if (agent && agent.name && agent.name !== 'Agent null') {
        
      // 🎵 SOUND SELECTION LOGIC - UPPDATERAD
      const settings = await soundSettings.getSettings();
      const dailyBudget = settings.dailyBudget || 3600;
      
      let soundType = 'default';
      let soundUrl = settings.defaultSound;
      
      // Kolla om agenten har nått milestone denna dealen
      const reachedBudget = newTotal >= dailyBudget && previousTotal < dailyBudget;
      
      if (newTotal < dailyBudget) {
        // ⭐ UNDER DAGSBUDGET: Alltid standard pling ljud
        soundType = 'default';
        soundUrl = settings.defaultSound;
        console.log(`🔔 Playing default sound for ${agent.name} (${newTotal} THB < ${dailyBudget} THB)`);
      } else {
        // ⭐ PÅ/ÖVER DAGSBUDGET: Personligt ljud eller milestone ljud
        const agentSound = await soundLibrary.getSoundForAgent(deal.userId);
        
        if (agentSound) {
          // 1. Agent har personligt ljud → spela det
          soundType = 'agent';
          soundUrl = agentSound.url;
          console.log(`💰 Playing custom sound for ${agent.name} (${newTotal} THB)`);
        } else {
          // 2. Agent har INGET personligt ljud → spela dagsbudget ljud
          soundType = 'milestone';
          soundUrl = settings.milestoneSound || settings.defaultSound;
          console.log(`🏆 Playing milestone sound for ${agent.name} (${newTotal} THB >= ${dailyBudget} THB)`);
        }
      }
        const notification = {
          deal: savedDeal,
          agent: agent,
          commission: deal.commission,
          soundType: soundType,
          soundUrl: soundUrl,
          dailyTotal: newTotal,
          reachedBudget: reachedBudget,
          timestamp: new Date().toISOString()
        };
        
        this.io.emit('new_deal', notification);
        console.log(`🎉 New deal notification sent for ${agent.name} (sound: ${soundType})`);
      } else {
        console.log(`⚠️  Skipping notification - no valid agent for userId ${deal.userId}`);
      }
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

  // 🔥 NY: Get pending deals status (för debugging)
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
