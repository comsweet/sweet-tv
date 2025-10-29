// backend/services/pollingService.js
// ✅ ENHANCED with BETTER DEDUPLICATION & LOGGING

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
    
    // Initialize all dependencies
    this.database = database;
    this.dealsCache = dealsCache;
    this.smsCache = smsCache;
    this.leaderboardCache = leaderboardCache;
    this.notificationSettings = notificationSettings;
    this.soundSettings = soundSettings;
    this.soundLibrary = soundLibrary;
    this.adversusAPI = adversusAPI;
    
    // Polling configuration
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 15000;
    this.lastCheckTime = new Date(Date.now() - 60000);
    this.isPolling = false;
    
    // Pending deals queue
    this.pendingDeals = new Map();
    this.maxRetries = 10;
    this.retryDelay = 15000;
    
    // 🔥 CRITICAL: Track notified leads to prevent duplicate notifications
    this.notifiedLeads = new Set();
    
    // Cleanup old notifications every hour
    setInterval(() => {
      const size = this.notifiedLeads.size;
      if (size > 0) {
        console.log(`\n🧹 Clearing notifiedLeads cache (${size} entries)`);
        this.notifiedLeads.clear();
        console.log(`✅ Cache cleared\n`);
      }
    }, 60 * 60 * 1000);
  }

  async start() {
    console.log(`\n🔄 ═══════════════════════════════════════════`);
    console.log(`🔄 STARTING POLLING SERVICE`);
    console.log(`⏱️  Interval: ${this.pollInterval}ms (${this.pollInterval / 1000}s)`);
    console.log(`═══════════════════════════════════════════\n`);
    
    // Initialize SMS cache
    await this.smsCache.init();
    
    this.isPolling = true;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop() {
    console.log('\n⏸️  ═══════════════════════════════════════════');
    console.log('⏸️  STOPPING POLLING SERVICE');
    console.log('═══════════════════════════════════════════\n');
    this.isPolling = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async poll() {
    if (!this.isPolling) return;

    try {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n🔍 [${timestamp}] Polling for new deals...`);
      
      // 1. Check pending deals first
      await this.checkPendingDeals();
      
      // 2. Fetch new success leads
      const result = await this.adversusAPI.getSuccessLeads(this.lastCheckTime);
      const newLeads = result.leads || [];
      
      if (newLeads.length > 0) {
        console.log(`\n✅ Found ${newLeads.length} new success leads`);
        
        for (const lead of newLeads) {
          await this.processDeal(lead);
        }
      }
      
      // 3. Auto-sync SMS cache if needed (every 2 minutes)
      await this.smsCache.autoSync(this.adversusAPI);
      
      // 4. Cleanup old pending deals
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
    
    console.log(`\n🔄 Checking ${this.pendingDeals.size} pending deals...`);
    
    const toProcess = [];
    const toRemove = [];
    
    for (const [leadId, pendingData] of this.pendingDeals.entries()) {
      const { lead, attempts, firstSeen } = pendingData;
      
      try {
        const response = await this.adversusAPI.request(`/leads/${leadId}`);
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
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`🎯 PROCESSING NEW DEAL`);
      console.log(`${'═'.repeat(70)}`);
      console.log(`🆔 Lead ID: ${lead.id}`);
      
      // 🔥 CRITICAL: Check if we already notified about this lead
      if (this.notifiedLeads.has(lead.id)) {
        console.log(`\n⚠️  DUPLICATE DEAL DETECTED!`);
        console.log(`   🆔 Lead ID ${lead.id} already processed`);
        console.log(`   ❌ BLOCKING duplicate notification`);
        console.log(`   📊 Total tracked: ${this.notifiedLeads.size} deals`);
        console.log(`${'═'.repeat(70)}\n`);
        return;
      }
      
      // Get commission from resultData
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commissionValue = parseFloat(commissionField?.value || 0);
      
      console.log(`💰 Commission: ${commissionValue.toFixed(2)} THB`);
      
      // Get multiDeals - Check BOTH masterData AND resultData
      let multiDeals = '1'; // Default
      
      // Try resultData first (field 74126)
      const resultMultiDeals = lead.resultData?.find(f => f.id === 74126);
      if (resultMultiDeals?.value) {
        multiDeals = resultMultiDeals.value;
        console.log(`🎯 MultiDeals: ${multiDeals} (found in resultData)`);
      } else {
        // Try masterData
        const masterMultiDeals = lead.masterData?.find(f => 
          f.label?.toLowerCase().includes('multideal') || 
          f.label?.toLowerCase().includes('multi deal') ||
          f.label?.toLowerCase().includes('antal deals') ||
          f.id === 74126 ||
          f.id === 74198
        );
        
        if (masterMultiDeals?.value) {
          multiDeals = masterMultiDeals.value;
          console.log(`🎯 MultiDeals: ${multiDeals} (found in masterData, field ${masterMultiDeals.id}: "${masterMultiDeals.label}")`);
        } else {
          console.log(`🎯 MultiDeals: ${multiDeals} (default, not found in data)`);
        }
      }
      
      // If commission = 0, add to pending queue (unless already from pending)
      if (commissionValue === 0 && !fromPending) {
        console.log(`⏳ Commission is 0 - Adding to pending queue`);
        console.log(`${'═'.repeat(70)}\n`);
        this.pendingDeals.set(lead.id, {
          lead: lead,
          attempts: 1,
          firstSeen: Date.now()
        });
        return;
      }
      
      // Get agent info BEFORE adding deal (to calculate previous total)
      const agent = await this.database.getAgent(lead.lastContactedBy);
      
      if (!agent) {
        console.log(`⚠️  Agent ${lead.lastContactedBy} not found in database`);
        console.log(`${'═'.repeat(70)}\n`);
        return;
      }
      
      console.log(`👤 Agent: ${agent.name} (ID: ${agent.userId})`);
      console.log(`📁 Group: ${agent.groupName || 'N/A'} (ID: ${agent.groupId || 'N/A'})`);
      
      // ✅ CRITICAL: Get today's total BEFORE adding the new deal
      const previousTotal = await this.dealsCache.getTodayTotalForAgent(lead.lastContactedBy);
      
      console.log(`\n📊 BUDGET CALCULATION:`);
      console.log(`   💼 Previous total (today): ${previousTotal.toFixed(2)} THB`);
      console.log(`   💰 This deal commission:   ${commissionValue.toFixed(2)} THB`);
      
      // Get Order Date
      const orderDateField = lead.resultData?.find(f => f.label === 'Order date');
      const orderDate = orderDateField?.value || lead.lastUpdatedTime;
      
      // Create deal object
      const deal = {
        leadId: lead.id,
        userId: lead.lastContactedBy,
        campaignId: lead.campaignId,
        commission: commissionValue,
        multiDeals: multiDeals,
        orderDate: orderDate,
        status: lead.status
      };
      
      // Add to cache
      await this.dealsCache.addDeal(deal);
      
      // Remove from pending if it was there
      if (this.pendingDeals.has(lead.id)) {
        console.log(`   ✅ Removed from pending queue (commission received)`);
        this.pendingDeals.delete(lead.id);
      }
      
      // Clear leaderboard cache so new stats are recalculated
      this.leaderboardCache.clear();
      
      // Calculate new total AFTER adding deal
      const newTotal = previousTotal + commissionValue;
      
      console.log(`   ➕ New total (today):      ${newTotal.toFixed(2)} THB`);
      
      // Count multiDeals
      const multiDealsCount = parseInt(multiDeals);
      console.log(`   🎯 Deal count:             ${multiDealsCount} deal(s)`);
      
      // Check if notification should be sent (group filtering)
      const shouldNotify = await this.notificationSettings.shouldNotify(agent);
      
      if (!shouldNotify) {
        console.log(`\n🚫 NOTIFICATION BLOCKED by group filter`);
        console.log(`${'═'.repeat(70)}\n`);
        return;
      }
      
      // ✅ SOUND LOGIC with detailed logging
      const settings = await this.soundSettings.getSettings();
      const dailyBudget = settings.dailyBudget || 3600;
      
      console.log(`\n🔊 SOUND LOGIC:`);
      console.log(`   🎯 Daily budget threshold: ${dailyBudget.toFixed(2)} THB`);
      console.log(`   📊 Previous total:         ${previousTotal.toFixed(2)} THB ${previousTotal < dailyBudget ? '(UNDER budget)' : '(OVER budget)'}`);
      console.log(`   📊 New total:              ${newTotal.toFixed(2)} THB ${newTotal < dailyBudget ? '(UNDER budget)' : '(OVER budget)'}`);
      
      // Calculate percentage of budget
      const budgetPercentage = (newTotal / dailyBudget * 100).toFixed(1);
      console.log(`   📈 Budget completion:      ${budgetPercentage}%`);
      
      let soundType = 'default';
      let soundUrl = settings.defaultSound || null;
      let reachedBudget = false;
      
      // Check if agent reached budget for the FIRST time today
      if (previousTotal < dailyBudget && newTotal >= dailyBudget) {
        reachedBudget = true;
        console.log(`   🏆 MILESTONE REACHED! Agent crossed budget threshold!`);
      }
      
      // Determine sound based on budget status
      if (newTotal >= dailyBudget) {
        // Agent is at/over budget
        if (agent.customSound && agent.preferCustomSound) {
          soundType = 'agent';
          soundUrl = agent.customSound;
          console.log(`   🎵 Sound type: AGENT (custom sound)`);
          console.log(`   📢 Reason: Agent over budget + has custom sound + preferCustomSound=true`);
        } else {
          soundType = 'milestone';
          soundUrl = settings.milestoneSound || settings.defaultSound;
          console.log(`   🎵 Sound type: MILESTONE (dagsbudget)`);
          console.log(`   📢 Reason: Agent over budget (${newTotal.toFixed(2)} >= ${dailyBudget})`);
          if (agent.customSound && !agent.preferCustomSound) {
            console.log(`   ℹ️  Note: Agent has custom sound but preferCustomSound=false`);
          } else if (!agent.customSound) {
            console.log(`   ℹ️  Note: Agent has no custom sound`);
          }
        }
      } else {
        soundType = 'default';
        soundUrl = settings.defaultSound || null;
        console.log(`   🎵 Sound type: DEFAULT (standard pling)`);
        console.log(`   📢 Reason: Agent under budget (${newTotal.toFixed(2)} < ${dailyBudget})`);
      }
      
      console.log(`   🔗 Sound URL: ${soundUrl || 'NONE'}`);
      
      // 🔥 CRITICAL: Mark this lead as notified BEFORE sending
      this.notifiedLeads.add(lead.id);
      console.log(`\n✅ NOTIFICATION APPROVED`);
      console.log(`   🆔 Tracking Lead ID: ${lead.id}`);
      console.log(`   📝 Total tracked: ${this.notifiedLeads.size} deals`);
      
      // Send notification via Socket.io
      const notification = {
        agent: {
          userId: agent.userId,
          name: agent.name,
          profileImage: agent.profileImage
        },
        commission: commissionValue,
        multiDeals: multiDealsCount,
        soundType: soundType,
        soundUrl: soundUrl,
        dailyTotal: newTotal,
        dailyBudget: dailyBudget,
        budgetPercentage: parseFloat(budgetPercentage),
        reachedBudget: reachedBudget,
        leadId: lead.id,
        timestamp: new Date().toISOString()
      };
      
      this.io.emit('new_deal', notification);
      
      console.log(`\n📡 NOTIFICATION SENT`);
      console.log(`   🎯 Event: new_deal`);
      console.log(`   👤 Agent: ${agent.name}`);
      console.log(`   💰 Commission: ${commissionValue.toFixed(2)} THB`);
      console.log(`   🔊 Sound: ${soundType}`);
      console.log(`   📊 Daily Total: ${newTotal.toFixed(2)} THB (${budgetPercentage}% of budget)`);
      console.log(`   🏆 Reached Budget: ${reachedBudget ? 'YES' : 'NO'}`);
      
      // Sync SMS cache after deal
      console.log(`\n📱 Syncing SMS cache...`);
      await this.smsCache.forceSync(this.adversusAPI);
      console.log(`✅ SMS cache synced`);
      
      console.log(`${'═'.repeat(70)}\n`);
      
    } catch (error) {
      console.error(`\n❌ ERROR PROCESSING DEAL`);
      console.error(`   🆔 Lead ID: ${lead.id}`);
      console.error(`   ❌ Error: ${error.message}`);
      console.error(`   📍 Stack: ${error.stack}`);
      console.log(`${'═'.repeat(70)}\n`);
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
    return {
      pending: pending,
      notifiedCount: this.notifiedLeads.size
    };
  }
}

module.exports = PollingService;
