// backend/services/pollingService.js
// ✅ FIXAD VERSION - Initialiserar alla dependencies i konstruktorn

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
    this.pollInterval = parseInt(process.env.POLL_INTERVAL) || 15000;
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
      
      // 3. Auto-sync SMS cache if needed
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
    
    console.log(`🔄 Checking ${this.pendingDeals.size} pending deals...`);
    
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
      console.log(`📌 Processing lead ${lead.id}...`);
      
      // Get commission from resultData
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commissionValue = parseFloat(commissionField?.value || 0);
      
      // Get multiDeals - IMPORTANT: Check BOTH masterData AND resultData
      let multiDeals = '1'; // Default
      
      // Try resultData first (field 74126)
      const resultMultiDeals = lead.resultData?.find(f => f.id === 74126);
      if (resultMultiDeals?.value) {
        multiDeals = resultMultiDeals.value;
        console.log(`  📊 Found multiDeals in resultData = ${multiDeals}`);
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
          console.log(`  📊 Found multiDeals in masterData (field ${masterMultiDeals.id}, label: "${masterMultiDeals.label}") = ${multiDeals}`);
        }
      }
      
      console.log(`  💰 Commission: ${commissionValue} THB`);
      console.log(`  🎯 MultiDeals: ${multiDeals}`);
      
      // If commission = 0, add to pending queue (unless already from pending)
      if (commissionValue === 0 && !fromPending) {
        console.log(`  ⏳ Commission is 0, adding to pending queue`);
        this.pendingDeals.set(lead.id, {
          lead: lead,
          attempts: 1,
          firstSeen: Date.now()
        });
        return;
      }
      
      // Remove from pending if it was there
      if (this.pendingDeals.has(lead.id)) {
        console.log(`  ✅ Removing from pending queue (commission received)`);
        this.pendingDeals.delete(lead.id);
      }
      
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
      
      // ✅ NOW this.dealsCache IS DEFINED!
      await this.dealsCache.addDeal(deal);
      
      // Clear leaderboard cache so new stats are recalculated
      this.leaderboardCache.clear();
      
      // Get agent info
      const agent = await this.database.getAgent(lead.lastContactedBy);
      
      if (!agent) {
        console.log(`  ⚠️ Agent ${lead.lastContactedBy} not found in database`);
        return;
      }
      
      // Count multiDeals
      const multiDealsCount = parseInt(multiDeals);
      console.log(`  🎯 This deal counts as ${multiDealsCount} deal(s)`);
      
      // Check if we should send notification
      const shouldNotify = await this.notificationSettings.shouldNotifyForAgent(
        agent.userId,
        agent.groupId
      );
      
      if (!shouldNotify) {
        console.log(`  🚫 Notification blocked by group filter`);
        return;
      }
      
      // Get today's total for notification
      const todayTotal = await this.dealsCache.getTodayTotalForAgent(lead.lastContactedBy);
      
      console.log(`  📊 Today's total for agent: ${todayTotal} THB (${multiDealsCount} deals)`);
      
      // Send notification via Socket.io
      this.io.emit('newDeal', {
        agent: {
          userId: agent.userId,
          name: agent.name,
          profileImage: agent.profileImage
        },
        commission: commissionValue,
        multiDeals: multiDealsCount,
        todayTotal: todayTotal,
        leadId: lead.id,
        timestamp: new Date().toISOString()
      });
      
      console.log(`  ✅ Deal processed and notification sent! (${multiDealsCount} deals)`);
      
    } catch (error) {
      console.error(`  ❌ Error processing deal:`, error);
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
