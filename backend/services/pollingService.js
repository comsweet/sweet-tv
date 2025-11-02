// backend/services/pollingService.js
// 🔥 KRITISK FIX: Auto-sync både SMS OCH DEALS cache var 2:e minut!
// 🔥🔥🔥 NEW: Reset SMS cache when deal is added so SMS syncs on next request!

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
    
    // ✅ KRITISKT FIX: Initialize all dependencies
    this.database = database;
    this.dealsCache = dealsCache;
    this.smsCache = smsCache;
    this.leaderboardCache = leaderboardCache;
    this.notificationSettings = notificationSettings;
    this.soundSettings = soundSettings;
    this.soundLibrary = soundLibrary;
    this.adversusAPI = adversusAPI;
    
    // Polling configuration
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 5000; // 5 seconds for fast response
    this.lastCheckTime = new Date(Date.now() - 60000);
    this.isPolling = false;
    
    // Pending deals queue
    this.pendingDeals = new Map();
    this.maxRetries = 10;
    this.retryDelay = 15000;
    
    // Track notified leads to prevent duplicate notifications
    this.notifiedLeads = new Set();
    
    // Cleanup old notifications every hour
    setInterval(() => {
      console.log(`🧹 Clearing notifiedLeads cache (${this.notifiedLeads.size} entries)`);
      this.notifiedLeads.clear();
    }, 60 * 60 * 1000);
  }

  async start() {
    console.log(`🔄 Starting polling (${this.pollInterval}ms interval)`);
    
    // Initialize SMS cache
    await this.smsCache.init();
    
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
      
      // 1. Check pending deals first
      await this.checkPendingDeals();
      
      // 2. Fetch new success leads
      const result = await this.adversusAPI.getSuccessLeads(this.lastCheckTime);
      const newLeads = result.leads || [];
      
      if (newLeads.length > 0) {
        console.log(`✅ Found ${newLeads.length} new success leads`);
        
        for (const lead of newLeads) {
          await this.processDeal(lead);
        }
      }
      
      // 🔥 KRITISK FIX: Auto-sync BÅDE SMS och DEALS cache!
      // 3. Auto-sync SMS cache if needed (every 2 minutes)
      await this.smsCache.autoSync(this.adversusAPI);
      
      // 4. Auto-sync DEALS cache if needed (every 2 minutes) - ✅ NY RAD!
      await this.dealsCache.autoSync(this.adversusAPI);
      
      // 5. Cleanup old pending deals
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
    
    for (const [leadId, pendingData] of this.pendingDeals.entries()) {
      const { lead, attempts, firstSeen } = pendingData;
      
      try {
        const response = await this.adversusAPI.request(`/leads/${leadId}`);
        const updatedLead = response.leads?.[0];
        
        if (!updatedLead) {
          console.log(`⚠️  Lead ${leadId} not found, removing from queue`);
          this.pendingDeals.delete(leadId);
          continue;
        }
        
        const commissionField = updatedLead.resultData?.find(f => f.id === 70163);
        const commissionValue = parseFloat(commissionField?.value || 0);
        
        if (commissionValue > 0) {
          console.log(`✅ Commission received for pending lead ${leadId}: ${commissionValue} THB`);
          await this.processDeal(updatedLead, true);
          this.pendingDeals.delete(leadId);
        } else if (attempts >= this.maxRetries) {
          console.log(`❌ Giving up on lead ${leadId} after ${attempts} attempts`);
          this.pendingDeals.delete(leadId);
        } else {
          // Increment attempts
          this.pendingDeals.set(leadId, {
            ...pendingData,
            attempts: attempts + 1
          });
        }
      } catch (error) {
        console.error(`❌ Error checking pending lead ${leadId}:`, error.message);
      }
    }
  }

  async processDeal(lead, isRetry = false) {
    try {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🎯 PROCESSING ${isRetry ? 'PENDING ' : ''}DEAL`);
      console.log(`${'='.repeat(70)}`);
      console.log(`📋 Lead ID:                ${lead.id}`);
      console.log(`👤 Agent ID:               ${lead.lastContactedBy}`);
      
      // Get commission
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commissionValue = parseFloat(commissionField?.value || 0);
      console.log(`💰 Commission:             ${commissionValue} THB`);
      
      // Check if already processed
      if (this.notifiedLeads.has(lead.id)) {
        console.log(`\n⚠️  DUPLICATE DEAL DETECTED!`);
        console.log(`   🆔 Lead ID ${lead.id} already processed`);
        console.log(`   ❌ BLOCKING notification to prevent spam`);
        console.log(`${'='.repeat(70)}\n`);
        return;
      }
      
      // If no commission, add to pending queue
      if (commissionValue === 0) {
        console.log(`\n⏳ NO COMMISSION YET`);
        console.log(`   Adding to pending queue (will retry every 15s)`);
        this.pendingDeals.set(lead.id, {
          lead: lead,
          attempts: 1,
          firstSeen: Date.now()
        });
        console.log(`${'='.repeat(70)}\n`);
        return;
      }
      
      // Get multiDeals (from masterData field 74126 OR 74198)
      let multiDeals = '1';
      const multiDealsField = lead.masterData?.find(f => 
        f.id === 74126 || 
        f.id === 74198 ||
        f.label?.toLowerCase().includes('multideal') ||
        f.label?.toLowerCase().includes('multi deal') ||
        f.label?.toLowerCase().includes('antal deals')
      );
      
      if (multiDealsField?.value) {
        multiDeals = multiDealsField.value;
        console.log(`📊 MultiDeals:             ${multiDeals} (field ${multiDealsField.id})`);
      } else {
        console.log(`📊 MultiDeals:             1 (default - field not found)`);
      }
      
      // Get agent
      const agent = await this.database.getAgent(lead.lastContactedBy);
      if (!agent) {
        console.log(`\n❌ AGENT NOT FOUND`);
        console.log(`   Agent ID ${lead.lastContactedBy} not in database`);
        console.log(`${'='.repeat(70)}\n`);
        return;
      }
      
      console.log(`👤 Agent Name:             ${agent.name}`);
      console.log(`👥 Agent Group:            ${agent.groupName || 'None'} (ID: ${agent.groupId || 'N/A'})`);
      
      // Get order date
      const orderDateField = lead.resultData?.find(f => f.label === 'Order date');
      const orderDate = orderDateField?.value || lead.lastUpdatedTime;
      console.log(`📅 Order Date:             ${orderDate}`);

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

      // ⚡ ATOMIC OPERATION: Add to cache and get previousTotal/newTotal atomically
      // This prevents race conditions when multiple deals arrive simultaneously
      const result = await this.dealsCache.addDeal(deal);

      if (!result) {
        console.log('❌ Deal already in cache or failed to add');
        return;
      }

      // Check if it's a duplicate (pending resolution)
      if (result.status === 'pending_duplicate') {
        console.log(`⚠️  DUPLICATE PENDING: Lead ${lead.id}`);
        console.log(`   Existing deal: ${JSON.stringify(result.existingDeal)}`);
        console.log(`   New deal: ${JSON.stringify(result.newDeal)}`);
        console.log(`   Pending ID: ${result.pendingId}`);
        // Don't play sound or send notification for duplicates
        return;
      }

      const { previousTotal, newTotal } = result;

      console.log(`\n💰 AGENT'S TODAY TOTAL (ATOMIC):`);
      console.log(`   Before this deal:      ${previousTotal.toFixed(2)} THB`);
      console.log(`   After this deal:       ${newTotal.toFixed(2)} THB`);

      // Remove from pending if it was there
      if (this.pendingDeals.has(lead.id)) {
        console.log(`   ✅ Removed from pending queue (commission received)`);
        this.pendingDeals.delete(lead.id);
      }

      // 🔥 CRITICAL: Sync new SMS immediately so leaderboard shows correct numbers
      // This only fetches NEW SMS since last sync (not all 85k!)
      try {
        await this.smsCache.pollNewSMS(this.adversusAPI);
        console.log(`📱 SMS synced after deal`);
      } catch (error) {
        console.error(`⚠️  SMS sync failed (non-critical):`, error.message);
      }

      // Clear leaderboard cache so new stats are recalculated
      this.leaderboardCache.clear();

      // Count multiDeals
      const multiDealsCount = parseInt(multiDeals);
      console.log(`   🎯 Deal count:         ${multiDealsCount} deal(s)`);
      
      // Check if notification should be sent (group filtering)
      const shouldNotify = await this.notificationSettings.shouldNotify(agent);
      
      if (!shouldNotify) {
        console.log(`\n🚫 NOTIFICATION BLOCKED by group filter`);
        console.log(`${'='.repeat(70)}\n`);
        return;
      }
      
      // ✅ FIXED SOUND LOGIC v2 - Correct hierarchy when over budget
      const settings = await this.soundSettings.getSettings();
      const dailyBudget = settings.dailyBudget || 3600;
      
      console.log(`\n🔊 SOUND LOGIC:`);
      console.log(`   Daily budget threshold: ${dailyBudget} THB`);
      console.log(`   Previous total:         ${previousTotal.toFixed(2)} THB (${previousTotal < dailyBudget ? 'UNDER' : 'OVER'} budget)`);
      console.log(`   New total:              ${newTotal.toFixed(2)} THB (${newTotal < dailyBudget ? 'UNDER' : 'OVER'} budget)`);
      
      let soundType = 'default';
      let soundUrl = settings.defaultSound || null;
      let reachedBudget = false;
      
      // ✅ Check if agent is OVER budget (regardless of when)
      if (newTotal >= dailyBudget) {
        console.log(`   🏆 Agent is OVER budget (${newTotal.toFixed(2)} >= ${dailyBudget} THB)`);
        
        // 1. Try to find agent-specific sound first
        const agentSound = await this.soundLibrary.getSoundForAgent(agent.userId);
        if (agentSound) {
          soundType = 'agent';
          soundUrl = agentSound.url;
          console.log(`   🎵 Using AGENT-SPECIFIC sound: "${agentSound.name}"`);
        } else if (settings.milestoneSound) {
          // 2. If no agent-specific sound, use milestone sound
          soundType = 'milestone';
          soundUrl = settings.milestoneSound;
          console.log(`   🎵 Using MILESTONE sound (no agent-specific sound found)`);
        } else {
          // 3. Fallback to default if nothing else is configured
          console.log(`   🎵 Using DEFAULT sound (no milestone sound configured)`);
        }
        
        // Special flag if this is the FIRST time reaching budget today
        if (previousTotal < dailyBudget) {
          reachedBudget = true;
          console.log(`   🎊 First time reaching budget today!`);
        }
      } else {
        // Agent is under budget - use default sound
        console.log(`   📊 Agent is UNDER budget (${newTotal.toFixed(2)} < ${dailyBudget} THB)`);
        console.log(`   🎵 Using DEFAULT sound`);
      }
      
      // Create notification
      const notification = {
        leadId: lead.id,
        agent: {
          userId: agent.userId,
          name: agent.name,
          profileImage: agent.profileImage
        },
        commission: commissionValue,
        multiDeals: multiDeals,
        totalToday: newTotal,
        reachedBudget: reachedBudget,
        soundType: soundType,
        soundUrl: soundUrl,
        timestamp: new Date().toISOString()
      };
      
      // Mark as notified
      this.notifiedLeads.add(lead.id);
      
      // Send notification via socket
      console.log(`\n📡 NOTIFICATION SENT`);
      console.log(`   📊 Daily Total: ${newTotal.toFixed(2)} THB (${((newTotal / dailyBudget) * 100).toFixed(1)}% of budget)`);
      console.log(`   🔊 Sound Type: ${soundType}`);
      console.log(`   🎵 Sound URL: ${soundUrl || 'None'}`);
      
      this.io.emit('new_deal', notification);

      // 🔥 CRITICAL: Invalidera cache så frontend får fresh stats!
      this.leaderboardCache.clear();
      console.log(`🗑️  Cleared leaderboard cache - next request will get fresh stats`);
      
      console.log(`${'='.repeat(70)}\n`);
      
    } catch (error) {
      console.error(`\n❌ ERROR PROCESSING DEAL:`, error);
      console.error(`   Lead ID: ${lead.id}`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.log(`${'='.repeat(70)}\n`);
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
