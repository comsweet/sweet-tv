const adversusAPI = require('./adversusAPI');
const database = require('./database');
const soundSettings = require('./soundSettings');
const soundLibrary = require('./soundLibrary');
const leaderboardCache = require('./leaderboardCache');
const dealsCache = require('./dealsCache');
const smsCache = require('./smsCache'); // 📱 NY: SMS Cache
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
      // Ta bort gamla entries (vi lagrar timestamp i Set)
      // För enkelhetens skull, rensa hela Set varje timme
      console.log(`🧹 Clearing notifiedLeads cache (${this.notifiedLeads.size} entries)`);
      this.notifiedLeads.clear();
    }, 60 * 60 * 1000); // En timme
  }

  async start() {
    console.log(`🔄 Starting polling (${this.pollInterval}ms interval)`);
    
    // 📱 NY: Initialize SMS cache
    await smsCache.init();
    
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
      
      // 3️⃣ 📱 NY: AUTO-SYNC SMS CACHE IF NEEDED
      await smsCache.autoSync(adversusAPI);
      
      // 4️⃣ RENSA GAMLA PENDING DEALS
      this.cleanupOldPendingDeals();
      
      this.lastCheckTime = new Date();
      
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
      
      try {
        const response = await adversusAPI.request(`/leads/${leadId}`);
        const updatedLead = response.leads?.[0];
        
        if (!updatedLead) {
          console.log(`⚠️  Lead ${leadId} not found, removing from pending`);
          toRemove.push(leadId);
          continue;
        }
        
        const commissionField = updatedLead.resultData?.find(f => f.id === 70163);
        const commissionValue = parseFloat(commissionField?.value || 0);
        
        if (commissionValue > 0) {
          console.log(`✅ Lead ${leadId} now has commission (${commissionValue} THB) after ${attempts} attempts!`);
          toProcess.push(updatedLead);
          toRemove.push(leadId);
        } else {
          if (attempts >= this.maxRetries) {
            const ageMinutes = Math.round((Date.now() - firstSeen) / 60000);
            console.log(`⏭️  Lead ${leadId} still no commission after ${attempts} attempts (${ageMinutes} min) - giving up`);
            toRemove.push(leadId);
          } else {
            this.pendingDeals.set(leadId, {
              ...pendingData,
              attempts: attempts + 1
            });
            console.log(`⏳ Lead ${leadId} still waiting... (attempt ${attempts + 1}/${this.maxRetries})`);
          }
        }
      } catch (error) {
        console.error(`❌ Error checking pending lead ${leadId}:`, error.message);
        
        if (attempts >= this.maxRetries) {
          toRemove.push(leadId);
        }
      }
    }
    
    for (const lead of toProcess) {
      await this.processDeal(lead, true);
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
            const agentData = {
              userId: adversusUser.id,
              name: adversusUser.name || 
                    `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                    `Agent ${adversusUser.id}`,
              email: adversusUser.email || '',
              groupId: adversusUser.group?.id ? parseInt(adversusUser.group.id) : null,
              groupName: adversusUser.group?.name || null
            };
            
            agent = await database.addAgent(agentData);
            console.log(`✅ Auto-created agent: ${agent.name} (group: ${agent.groupId})`);
          }
        } catch (error) {
          console.error(`⚠️  Could not fetch user ${deal.userId} from Adversus:`, error.message);
        }
      } else if (!agent.groupId) {
        // 🔥 FIX: Om agent finns men saknar groupId, uppdatera från Adversus
        try {
          console.log(`⚠️  Agent ${agent.name} missing groupId, fetching from Adversus...`);
          const userResponse = await adversusAPI.getUser(deal.userId);
          const adversusUser = userResponse.users?.[0];
          
          if (adversusUser && adversusUser.group?.id) {
            const groupId = parseInt(adversusUser.group.id);
            const groupName = adversusUser.group.name || null;
            
            await database.updateAgent(deal.userId, {
              groupId: groupId,
              groupName: groupName
            });
            
            // Uppdatera lokala agent-objektet
            agent.groupId = groupId;
            agent.groupName = groupName;
            
            console.log(`✅ Updated agent ${agent.name} with groupId: ${groupId} (${groupName})`);
          }
        } catch (error) {
          console.error(`⚠️  Could not update groupId for agent ${deal.userId}:`, error.message);
        }
      }
      
      // Skicka notification
      if (agent) {
        const settings = await soundSettings.getSettings();
        const dailyBudget = settings.dailyBudget || 3600; // 🔥 FIX: Default till 3600 THB
        
        let soundType = 'default';
        let soundUrl = settings.defaultSound;
        let reachedBudget = false;
        
        // 🔥 FIX: Markera om detta är FÖRSTA gången budgeten nås
        if (previousTotal < dailyBudget && newTotal >= dailyBudget) {
          reachedBudget = true;
          console.log(`🎉 Agent ${agent.name} REACHED daily budget for first time! (${newTotal} THB >= ${dailyBudget} THB)`);
        }
        
        // 🔥 NY LOGIK: Kolla om agenten är ÖVER budgeten (oavsett om det är första gången)
        if (newTotal >= dailyBudget) {
          console.log(`💰 Agent ${agent.name} is at/over budget (${newTotal} THB >= ${dailyBudget} THB)`);
          
          // Försök hitta custom sound
          let agentSound = null;
          if (agent.customSound) {
            const allSounds = await soundLibrary.getSounds();
            agentSound = allSounds.find(s => s.url === agent.customSound);
          }
          
          // 🔥 NY LJUDLOGIK:
          // 1. HAR personligt ljud OCH preferCustomSound → Spela personligt ljud
          // 2. HAR INTE personligt ljud → Spela milestone ljud
          if (agentSound && agent.preferCustomSound) {
            soundType = 'agent';
            soundUrl = agentSound.url;
            console.log(`🎵 Playing CUSTOM sound for ${agent.name}: ${agentSound.name}`);
          } else if (settings.milestoneSound) {
            soundType = 'milestone';
            soundUrl = settings.milestoneSound;
            console.log(`🏆 Playing MILESTONE sound for ${agent.name} (no custom sound or not preferred)`);
          }
        } else {
          // Under budgeten → standard ljud
          console.log(`📊 Agent ${agent.name} is under budget (${newTotal} THB < ${dailyBudget} THB) - playing default sound`);
        }
        
        const notification = {
          deal: savedDeal || {
            leadId: deal.leadId,
            userId: deal.userId,
            commission: commissionValue,
            orderDate: deal.orderDate
          },
          agent: agent,
          commission: deal.commission,
          soundType: soundType,
          soundUrl: soundUrl,
          dailyTotal: newTotal,
          reachedBudget: reachedBudget,
          timestamp: new Date().toISOString()
        };
        
        // Filtrera baserat på group settings
        const shouldNotify = await notificationSettings.shouldNotify(agent);
        
        // 🔥 FIX: Extra logging för debugging
        console.log(`🔍 Notification check for ${agent.name}:`, {
          groupId: agent.groupId,
          shouldNotify: shouldNotify
        });
        
        if (shouldNotify) {
          this.io.emit('new_deal', notification);
          console.log(`🎉 New deal notification sent for ${agent.name} (sound: ${soundType}, group: ${agent.groupId})`);
          
          // 🔥 NY: Markera som notified
          this.notifiedLeads.add(lead.id);
        } else {
          console.log(`🚫 Notification blocked for ${agent.name} (group ${agent.groupId} is filtered out)`);
          // 🔥 NY: Markera som notified även om blockerad (för att inte försöka igen)
          this.notifiedLeads.add(lead.id);
        }
      } else {
        console.log(`⚠️  Skipping notification - no valid agent for userId ${deal.userId}`);
      }
      
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
