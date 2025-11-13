const db = require('./postgres');

/**
 * IMPROVED DEALS CACHE - PostgreSQL + Write-Through Cache
 *
 * Strategy:
 * - ALL data persisted in PostgreSQL (historical data preserved)
 * - In-memory cache for TODAY's data only (fast access)
 * - Write-through: Save to DB immediately, update cache synchronously
 * - Duplicate detection: Automatic pending queue for manual resolution
 * - Auto-sync: Smart UPSERT strategy every 2 minutes
 *
 * Rolling window for sync: Current month + 7 days before
 * Cache window: Today only (00:00 - 23:59)
 */
class DealsCache {
  constructor() {
    console.log(`💾 Deals cache (PostgreSQL + write-through)`);

    // In-memory cache - ONLY for today's data
    this.todayCache = new Map(); // leadId -> deal
    this.todayUserTotals = new Map(); // userId -> total commission

    // Retry queue for failed DB writes
    this.retryQueue = [];
    this.retryTimer = null;

    // Last sync timestamp
    this.lastSync = null;

    // Init
    this.initCache();
  }

  async initCache() {
    try {
      // Ensure PostgreSQL is initialized
      await db.init();

      // Load today's deals into cache
      await this.loadTodayCache();

      // Start retry processor
      this.startRetryProcessor();

      // Start midnight cache reset scheduler
      this.startMidnightScheduler();

      console.log('✅ Deals cache initialized with PostgreSQL');
    } catch (error) {
      console.error('❌ Error initializing deals cache:', error);
    }
  }

  // Public init method for explicit initialization (for consistency with smsCache)
  async init() {
    await this.initCache();
  }

  async loadTodayCache() {
    try {
      const { start, end } = this.getTodayWindow();
      console.log(`🔍 Loading today cache: ${start.toISOString()} → ${end.toISOString()}`);

      const todayDeals = await db.getDealsInRange(start, end);
      console.log(`📊 DB returned ${todayDeals.length} deals for today (current cache: ${this.todayCache.size} deals)`);

      if (todayDeals.length > 0) {
        console.log(`   First deal: lead_id=${todayDeals[0].lead_id}, user_id=${todayDeals[0].user_id}, commission=${todayDeals[0].commission}`);
      }

      // 🛡️ ENHANCED SAFETY CHECK: Prevent cache from shrinking unexpectedly
      // This protects against:
      // 1. DB connection issues (returns 0 or partial data)
      // 2. Race conditions (DB read during transaction)
      // 3. Timezone bugs (wrong date range)
      const currentCacheSize = this.todayCache.size;
      const newCacheSize = todayDeals.length;

      // If new data is significantly smaller than current cache, something is wrong!
      // Threshold: 80% - allow small shrinkage (deal deletions) but block major drops
      if (currentCacheSize > 0 && newCacheSize < currentCacheSize * 0.8) {
        console.error(`🚨 SAFETY CHECK FAILED: Preventing suspicious cache shrinkage!`);
        console.error(`   Current cache: ${currentCacheSize} deals`);
        console.error(`   DB returned:   ${newCacheSize} deals (${Math.round((newCacheSize/currentCacheSize)*100)}% of current)`);
        console.error(`   This indicates a DB issue, race condition, or timezone bug.`);
        console.error(`   KEEPING EXISTING CACHE to prevent data loss!`);

        // Log what DB returned for debugging (if small dataset)
        if (newCacheSize > 0 && newCacheSize < 5) {
          console.error(`   DB deals: ${todayDeals.map(d => `lead_id=${d.lead_id}`).join(', ')}`);
        }

        return; // Don't overwrite cache with suspicious data
      }

      // 🔒 ATOMIC SWAP: Build new cache first, then replace in one operation
      // This prevents race condition where cache is temporarily empty
      const newCache = new Map();
      const newUserTotals = new Map();

      for (const deal of todayDeals) {
        newCache.set(deal.lead_id, this.dbToCache(deal));

        // Update user totals
        const currentTotal = newUserTotals.get(deal.user_id) || 0;
        newUserTotals.set(deal.user_id, currentTotal + parseFloat(deal.commission || 0));
      }

      // Atomic swap - cache is never empty (unless DB really has no data)
      this.todayCache = newCache;
      this.todayUserTotals = newUserTotals;

      console.log(`💾 Loaded ${todayDeals.length} deals into today's cache (cache size: ${this.todayCache.size})`);
    } catch (error) {
      console.error('❌ Error loading today cache:', error);
      throw error; // Re-throw so caller knows it failed
    }
  }

  getTodayWindow() {
    // Use UTC for all date calculations
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
  }

  getRollingWindow() {
    // Use UTC for rolling window calculation
    const now = new Date();

    // Start: First day of month - 7 days (UTC)
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    startDate.setUTCDate(startDate.getUTCDate() - 7);

    // End: Last day of month (UTC)
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    return { startDate, endDate };
  }

  // Convert DB row to cache format
  dbToCache(dbRow) {
    return {
      leadId: dbRow.lead_id,
      userId: dbRow.user_id,
      campaignId: dbRow.campaign_id,
      commission: parseFloat(dbRow.commission || 0),
      multiDeals: dbRow.multi_deals || 1,
      orderDate: dbRow.order_date,
      status: dbRow.status,
      syncedAt: dbRow.synced_at || dbRow.created_at
    };
  }

  // Convert cache format to DB format
  cacheToDb(deal) {
    return {
      leadId: deal.leadId,
      userId: deal.userId,
      campaignId: deal.campaignId,
      commission: deal.commission,
      multiDeals: deal.multiDeals || 1,
      orderDate: deal.orderDate,
      status: deal.status
    };
  }

  /**
   * Add deal with duplicate detection
   * Returns immediately after updating cache (< 1ms)
   * DB write happens in background
   */
  async addDeal(deal) {
    try {
      // VALIDATION: Ensure campaignId is valid
      // Sometimes Adversus sends campaignId as name instead of ID
      let campaignId = parseInt(deal.campaignId);
      if (isNaN(campaignId) && deal.campaign?.id) {
        console.warn(`⚠️  deal.campaignId is not a number ("${deal.campaignId}"), using deal.campaign.id instead`);
        campaignId = parseInt(deal.campaign.id);
      }

      // If still invalid, reject this deal
      if (isNaN(campaignId)) {
        console.error(`❌ [DealsCache/addDeal] Invalid campaignId, rejecting deal:`, {
          leadId: deal.leadId,
          rawCampaignId: deal.campaignId,
          campaignObjId: deal.campaign?.id
        });
        throw new Error(`Invalid campaignId: "${deal.campaignId}"`);
      }

      // Override campaignId with validated integer
      deal = { ...deal, campaignId };

      // 1. Check for duplicate in DB
      const existing = await db.getDealByLeadId(deal.leadId);

      if (existing.length > 0) {
        const existingDeal = existing[0];

        // Check if it's the SAME deal (from auto-sync) or a TRUE duplicate
        const isSameDeal =
          existingDeal.user_id === deal.userId &&
          parseFloat(existingDeal.commission) === parseFloat(deal.commission);

        if (isSameDeal) {
          // This is the same deal we already have (from polling/sync)
          console.log(`✅ Deal ${deal.leadId} already in DB (from sync) - updating cache only`);

          // Update cache if deal is for today
          const dealDate = new Date(deal.orderDate || new Date());
          const { start, end } = this.getTodayWindow();

          if (dealDate >= start && dealDate <= end) {
            const previousTotal = this.todayUserTotals.get(deal.userId) || 0;
            const commission = parseFloat(deal.commission) || 0;
            const newTotal = previousTotal + commission;

            this.todayCache.set(deal.leadId, {
              leadId: deal.leadId,
              userId: deal.userId,
              campaignId: deal.campaignId,
              commission: commission,
              multiDeals: deal.multiDeals || 1,
              orderDate: deal.orderDate || new Date().toISOString(),
              status: deal.status,
              syncedAt: new Date().toISOString()
            });
            this.todayUserTotals.set(deal.userId, newTotal);

            return {
              success: true,
              deal: this.todayCache.get(deal.leadId),
              previousTotal,
              newTotal
            };
          }

          // Not today's deal, just return success
          return {
            success: true,
            deal: deal,
            previousTotal: 0,
            newTotal: parseFloat(deal.commission) || 0
          };
        }

        // TRUE DUPLICATE - different user or commission!
        console.log(`🚨 TRUE DUPLICATE DETECTED: Lead ${deal.leadId}`);
        console.log(`   Existing: user=${existingDeal.user_id}, commission=${existingDeal.commission}`);
        console.log(`   New: user=${deal.userId}, commission=${deal.commission}`);

        const pendingDup = await db.createPendingDuplicate({
          leadId: deal.leadId,
          newDealData: deal,
          existingDealId: existingDeal.id
        });

        return {
          success: false,
          status: 'pending_duplicate',
          message: `Duplicate detected for lead ${deal.leadId}`,
          pendingId: pendingDup.id,
          existingDeal: this.dbToCache(existingDeal),
          newDeal: deal
        };
      }

      // 2. Calculate previousTotal from cache (FAST)
      const previousTotal = this.todayUserTotals.get(deal.userId) || 0;
      const commission = parseFloat(deal.commission) || 0;
      const newTotal = previousTotal + commission;

      // 3. Update cache IMMEDIATELY (synchronous, < 0.1ms)
      const newDeal = {
        leadId: deal.leadId,
        userId: deal.userId,
        campaignId: deal.campaignId,
        commission: commission,
        multiDeals: deal.multiDeals || 1,
        orderDate: deal.orderDate || new Date().toISOString(),
        status: deal.status,
        syncedAt: new Date().toISOString()
      };

      // Check if deal is for today
      const dealDate = new Date(newDeal.orderDate);
      const { start, end } = this.getTodayWindow();

      if (dealDate >= start && dealDate <= end) {
        this.todayCache.set(newDeal.leadId, newDeal);
        this.todayUserTotals.set(newDeal.userId, newTotal);
      }

      console.log(`⚡ Deal ${deal.leadId} added to cache: ${previousTotal.toFixed(2)} → ${newTotal.toFixed(2)} THB`);

      // 4. Save to PostgreSQL ASYNC (fire-and-forget with retry)
      this.persistToDBAsync(newDeal);

      // 5. Return IMMEDIATELY for ping sound! 🔔
      return {
        success: true,
        deal: newDeal,
        previousTotal,
        newTotal
      };

    } catch (error) {
      console.error('❌ Error adding deal:', error);
      throw error;
    }
  }

  /**
   * Async DB write with retry queue
   */
  async persistToDBAsync(deal) {
    try {
      await db.insertDeal(this.cacheToDb(deal));
      console.log(`✅ Deal ${deal.leadId} saved to PostgreSQL`);
    } catch (error) {
      // No unique constraint - all inserts should succeed
      // If error occurs, add to retry queue
      console.error(`❌ DB write failed for ${deal.leadId}, adding to retry queue:`, error.message);
      this.retryQueue.push(deal);
    }
  }

  /**
   * Retry processor for failed DB writes
   */
  startRetryProcessor() {
    this.retryTimer = setInterval(async () => {
      if (this.retryQueue.length > 0) {
        console.log(`🔄 Processing ${this.retryQueue.length} failed DB writes...`);

        const toRetry = [...this.retryQueue];
        this.retryQueue = [];

        for (const deal of toRetry) {
          // Validate deal before retry (prevent infinite retry loops for invalid data)
          if (!deal.campaignId || isNaN(parseInt(deal.campaignId))) {
            console.error(`❌ Skipping retry for deal ${deal.leadId} - invalid campaignId: "${deal.campaignId}"`);
            continue; // Don't retry invalid deals
          }

          try {
            await db.insertDeal(this.cacheToDb(deal));
            console.log(`✅ Retry successful for ${deal.leadId}`);
          } catch (error) {
            // Check if error is permanent (data validation error) or transient (network/timeout)
            const isPermanentError = error.message.includes('invalid input syntax') ||
                                    error.message.includes('violates') ||
                                    error.message.includes('constraint');

            if (isPermanentError) {
              console.error(`❌ Permanent error for deal ${deal.leadId}, will NOT retry:`, error.message);
              // Don't add back to retry queue - this deal has invalid data
            } else {
              console.error(`❌ Transient error for deal ${deal.leadId}, will retry:`, error.message);
              this.retryQueue.push(deal); // Try again later for transient errors only
            }
          }
        }
      }
    }, 30000); // Retry every 30 seconds
  }

  /**
   * Poll for NEW deals only (timestamp-based incremental sync)
   */
  async pollNewDeals(adversusAPI) {
    console.log('🔍 Polling for new deals...');

    // Get last sync timestamp
    const lastSyncDate = new Date(this.lastSync);
    const now = new Date();

    console.log(`📅 Polling since: ${lastSyncDate.toISOString()}`);

    try {
      // Fetch only deals updated since last sync
      const result = await adversusAPI.getLeadsInDateRange(lastSyncDate, now);
      const leads = result.leads || [];

      if (leads.length === 0) {
        console.log('✅ No new deals since last poll');
        this.lastSync = now.toISOString();
        return [];
      }

      console.log(`✅ Found ${leads.length} new/updated leads`);

      const deals = leads.map(lead => {
        const commissionField = lead.resultData?.find(f => f.id === 70163);
        const commission = parseFloat(commissionField?.value || 0);

        let multiDeals = 1;
        const resultMultiDeals = lead.resultData?.find(f => f.id === 74126);
        if (resultMultiDeals?.value) {
          multiDeals = parseInt(resultMultiDeals.value) || 1;
        }

        const orderDateField = lead.resultData?.find(f => f.label === 'Order date');

        // VALIDATION: Ensure all IDs are valid integers
        const leadId = parseInt(lead.id);
        const userId = parseInt(lead.lastContactedBy);

        // CAMPAIGN ID: Try lead.campaignId first, fallback to lead.campaign.id
        // Sometimes Adversus returns campaignId as name instead of ID
        let campaignId = parseInt(lead.campaignId);
        if (isNaN(campaignId) && lead.campaign?.id) {
          console.warn(`⚠️  lead.campaignId is not a number ("${lead.campaignId}"), using lead.campaign.id instead`);
          campaignId = parseInt(lead.campaign.id);
        }

        if (isNaN(leadId) || isNaN(userId) || isNaN(campaignId)) {
          console.error(`❌ [DealsCache/pollNewDeals] Invalid ID in lead data:`, {
            leadId: lead.id,
            userId: lead.lastContactedBy,
            rawCampaignId: lead.campaignId,
            campaignObjId: lead.campaign?.id,
            parsedCampaignId: campaignId,
            leadName: lead.name,
            campaignName: lead.campaign?.name
          });
          return null; // Skip this invalid deal
        }

        return {
          leadId,
          userId,
          campaignId,
          commission: commission,
          multiDeals: multiDeals,
          orderDate: orderDateField?.value || lead.lastUpdatedTime,
          status: lead.status
        };
      }).filter(deal => deal !== null); // Remove invalid deals

      // Filter out deals without userId (required field)
      const validDeals = deals.filter(deal => deal.userId != null);
      const skippedDeals = leads.length - deals.length + (deals.length - validDeals.length);

      if (skippedDeals > 0) {
        console.log(`⚠️  Skipped ${skippedDeals} deals without user_id`);
      }

      // Batch insert/update to PostgreSQL
      await db.batchInsertDeals(validDeals.map(d => this.cacheToDb(d)));

      // Add new deals to cache instead of reloading entire cache
      // This prevents race condition where webhook deals haven't finished writing to PostgreSQL yet
      for (const deal of validDeals) {
        const dealDate = new Date(deal.orderDate);
        const { start, end } = this.getTodayWindow();

        if (dealDate >= start && dealDate <= end) {
          // Only add if not already in cache (webhook might have added it already)
          if (!this.todayCache.has(deal.leadId)) {
            this.todayCache.set(deal.leadId, deal);

            // Update user totals
            const currentTotal = this.todayUserTotals.get(deal.userId) || 0;
            this.todayUserTotals.set(deal.userId, currentTotal + parseFloat(deal.commission || 0));
            console.log(`   💾 Added ${deal.leadId} to today cache (${deal.multiDeals} deals)`);
          }
        }
      }

      this.lastSync = now.toISOString();

      const dealsWithCommission = validDeals.filter(deal => deal.commission > 0);
      console.log(`💾 Polled ${validDeals.length} deals (${dealsWithCommission.length} with commission)`);

      return validDeals;
    } catch (error) {
      console.error('❌ Error polling new deals:', error.message);
      throw error;
    }
  }

  /**
   * Sync deals from Adversus with smart UPSERT strategy (FULL SYNC)
   */
  async syncDeals(adversusAPI) {
    console.log('🔄 Full sync: Fetching rolling window from Adversus...');

    const { startDate, endDate } = this.getRollingWindow();
    console.log(`📅 Rolling window: ${startDate.toISOString()} → ${endDate.toISOString()}`);

    try {
      const result = await adversusAPI.getLeadsInDateRange(startDate, endDate);
      const leads = result.leads || [];

      console.log(`✅ Fetched ${leads.length} leads from Adversus`);

      const deals = leads.map(lead => {
        const commissionField = lead.resultData?.find(f => f.id === 70163);
        const commission = parseFloat(commissionField?.value || 0);

        let multiDeals = 1;
        const resultMultiDeals = lead.resultData?.find(f => f.id === 74126);
        if (resultMultiDeals?.value) {
          multiDeals = parseInt(resultMultiDeals.value) || 1;
        }

        const orderDateField = lead.resultData?.find(f => f.label === 'Order date');

        // VALIDATION: Ensure all IDs are valid integers
        const leadId = parseInt(lead.id);
        const userId = parseInt(lead.lastContactedBy);

        // CAMPAIGN ID: Try lead.campaignId first, fallback to lead.campaign.id
        // Sometimes Adversus returns campaignId as name instead of ID
        let campaignId = parseInt(lead.campaignId);
        if (isNaN(campaignId) && lead.campaign?.id) {
          console.warn(`⚠️  lead.campaignId is not a number ("${lead.campaignId}"), using lead.campaign.id instead`);
          campaignId = parseInt(lead.campaign.id);
        }

        if (isNaN(leadId) || isNaN(userId) || isNaN(campaignId)) {
          console.error(`❌ [DealsCache/syncDeals] Invalid ID in lead data:`, {
            leadId: lead.id,
            userId: lead.lastContactedBy,
            rawCampaignId: lead.campaignId,
            campaignObjId: lead.campaign?.id,
            parsedCampaignId: campaignId,
            leadName: lead.name,
            campaignName: lead.campaign?.name
          });
          return null; // Skip this invalid deal
        }

        return {
          leadId,
          userId,
          campaignId,
          commission: commission,
          multiDeals: multiDeals,
          orderDate: orderDateField?.value || lead.lastUpdatedTime,
          status: lead.status
        };
      }).filter(deal => deal !== null); // Remove invalid deals

      // Filter out deals without userId (required field)
      const validDeals = deals.filter(deal => deal.userId != null);
      const skippedDeals = leads.length - deals.length + (deals.length - validDeals.length);

      if (skippedDeals > 0) {
        console.log(`⚠️  Skipped ${skippedDeals} deals without user_id`);
      }

      // Delete deals that exist in DB but are NOT in Adversus anymore (Smart UPSERT)
      // This handles deals that were removed/cancelled in Adversus
      const leadIds = validDeals.map(d => d.leadId);
      const deletedCount = await db.deleteDealsNotInList(startDate, endDate, leadIds);
      if (deletedCount > 0) {
        console.log(`🗑️  Deleted ${deletedCount} deals no longer in Adversus`);
      }

      // Batch insert/update to PostgreSQL
      await db.batchInsertDeals(validDeals.map(d => this.cacheToDb(d)));

      // Reload today's cache (FULL sync needs reload to handle deletions)
      // BUT: Wait 100ms first to let webhook deals finish their async PostgreSQL writes
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.loadTodayCache();

      this.lastSync = new Date().toISOString();

      const dealsWithCommission = deals.filter(deal => deal.commission > 0);
      console.log(`💾 Synced ${deals.length} deals to PostgreSQL`);
      console.log(`   - ${dealsWithCommission.length} deals WITH commission`);

      return deals;
    } catch (error) {
      console.error('❌ Error syncing deals:', error.message);
      throw error;
    }
  }

  /**
   * Get deals in date range (from DB or cache)
   */
  async getDealsInRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const { start: todayStart, end: todayEnd } = this.getTodayWindow();

    // DEBUG: Log all cache reads
    const cacheSize = this.todayCache.size;
    const isToday = start >= todayStart && end <= todayEnd;
    console.log(`📖 getDealsInRange: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]} (todayCache: ${cacheSize} deals, isToday: ${isToday})`);

    // Case 1: Query is entirely for today → use cache (FAST!)
    if (start >= todayStart && end <= todayEnd) {
      const result = Array.from(this.todayCache.values()).filter(deal => {
        const dealDate = new Date(deal.orderDate);
        return dealDate >= start && dealDate <= end;
      });
      console.log(`   ✅ Returning ${result.length} deals from todayCache`);
      return result;
    }

    // Case 2: Query is entirely before today → use PostgreSQL only
    if (end < todayStart) {
      const dbDeals = await db.getDealsInRange(start, end);
      console.log(`   ✅ Returning ${dbDeals.length} historical deals from PostgreSQL`);
      return dbDeals.map(d => this.dbToCache(d));
    }

    // Case 3: Query spans multiple days INCLUDING today → HYBRID approach
    // This fixes trend chart sync issue: historical data from DB + live data from cache
    const results = [];

    // Get historical deals from PostgreSQL (before today)
    if (start < todayStart) {
      const historicalEnd = new Date(todayStart.getTime() - 1); // End at 23:59:59 yesterday
      const dbDeals = await db.getDealsInRange(start, historicalEnd);
      results.push(...dbDeals.map(d => this.dbToCache(d)));
      console.log(`   📦 HYBRID: ${dbDeals.length} historical deals from PostgreSQL`);
    }

    // Get today's deals from cache (LIVE data!)
    if (end >= todayStart) {
      const todayDeals = Array.from(this.todayCache.values()).filter(deal => {
        const dealDate = new Date(deal.orderDate);
        return dealDate >= todayStart && dealDate <= end;
      });
      results.push(...todayDeals);
      console.log(`   📦 HYBRID: ${todayDeals.length} today deals from todayCache`);
    }

    console.log(`   ✅ HYBRID: Returning total ${results.length} deals`);
    return results;
  }

  /**
   * Get all deals (for backward compatibility)
   */
  async getCache() {
    // Return today's cache as array
    return Array.from(this.todayCache.values());
  }

  /**
   * Auto-sync if needed (every 2 minutes)
   */
  async needsSync() {
    if (!this.lastSync) {
      return true;
    }

    const lastSyncDate = new Date(this.lastSync);
    const minutesSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60);

    if (minutesSinceSync >= 2) {
      console.log(`⏰ Last sync was ${Math.round(minutesSinceSync)} min ago - needs sync`);
      return true;
    }

    console.log(`✅ Last sync was ${Math.round(minutesSinceSync)} min ago - cache is fresh`);
    return false;
  }

  async autoSync(adversusAPI) {
    if (await this.needsSync()) {
      // If no previous sync → do full sync (rolling window)
      if (!this.lastSync) {
        console.log('⚠️  No sync found - needs initial sync');
        return await this.syncDeals(adversusAPI);
      }

      // If previous sync exists → poll for new deals only
      return await this.pollNewDeals(adversusAPI);
    }

    console.log('✅ Using cached deals');
    return await this.getCache();
  }

  async forceSync(adversusAPI) {
    console.log('🔄 FORCE SYNC initiated from admin');
    return await this.syncDeals(adversusAPI);
  }

  /**
   * Clean old deals (optional - DB keeps history)
   */
  async cleanOldDeals() {
    // No-op: PostgreSQL keeps all history
    // Could implement archiving to separate table if needed
    console.log('ℹ️  cleanOldDeals: PostgreSQL keeps all history');
  }

  /**
   * Get stats
   */
  async getStats() {
    const { startDate, endDate } = this.getRollingWindow();
    const allDeals = await db.getDealsInRange(startDate, endDate);

    return {
      totalDeals: allDeals.length,
      todayDeals: this.todayCache.size,
      lastSync: this.lastSync,
      rollingWindow: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      totalCommission: allDeals.reduce((sum, d) => sum + parseFloat(d.commission || 0), 0),
      uniqueAgents: new Set(allDeals.map(d => d.user_id)).size,
      retryQueueLength: this.retryQueue.length
    };
  }

  /**
   * Get today's total for agent (from cache - FAST!)
   */
  async getTodayTotalForAgent(userId) {
    const total = this.todayUserTotals.get(userId) || 0;
    console.log(`📊 Today's total for agent ${userId}: ${total} THB (from cache)`);
    return total;
  }

  /**
   * Get today's deals for agent (from cache)
   */
  async getTodayDealsForAgent(userId) {
    return Array.from(this.todayCache.values()).filter(deal =>
      String(deal.userId) === String(userId)
    );
  }

  /**
   * Start scheduler to reset cache at midnight every day
   * This ensures "today's" cache is always current even if server runs 24/7
   */
  startMidnightScheduler() {
    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 1, 0); // 00:00:01 tomorrow

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      console.log(`🕐 Midnight cache reset scheduled for ${tomorrow.toISOString()} (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);

      this.midnightTimer = setTimeout(async () => {
        console.log('🌙 MIDNIGHT: Resetting deals cache for new day...');
        try {
          await this.loadTodayCache();
          console.log('✅ Deals cache reset complete for new day');
        } catch (error) {
          console.error('❌ Error resetting deals cache at midnight:', error);
        }

        // Schedule next midnight reset
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    scheduleNextMidnight();
  }

  /**
   * Invalidate cache (reload from DB)
   */
  async invalidateCache() {
    console.log('🔄 Invalidating cache, reloading from DB...');
    await this.loadTodayCache();
  }
}

module.exports = new DealsCache();
