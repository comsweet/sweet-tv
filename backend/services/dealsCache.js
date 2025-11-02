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
      const todayDeals = await db.getDealsInRange(start, end);

      // Populate cache
      this.todayCache.clear();
      this.todayUserTotals.clear();

      for (const deal of todayDeals) {
        this.todayCache.set(deal.lead_id, this.dbToCache(deal));

        // Update user totals
        const currentTotal = this.todayUserTotals.get(deal.user_id) || 0;
        this.todayUserTotals.set(deal.user_id, currentTotal + parseFloat(deal.commission || 0));
      }

      console.log(`💾 Loaded ${todayDeals.length} deals into today's cache`);
    } catch (error) {
      console.error('❌ Error loading today cache:', error);
      throw error; // Re-throw so caller knows it failed
    }
  }

  getTodayWindow() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  getRollingWindow() {
    const now = new Date();

    // Start: First day of month - 7 days
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    // End: Last day of month
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);

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
          try {
            await db.insertDeal(this.cacheToDb(deal));
            console.log(`✅ Retry successful for ${deal.leadId}`);
          } catch (error) {
            console.error(`❌ Retry failed for ${deal.leadId}:`, error.message);
            this.retryQueue.push(deal); // Try again later
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

        return {
          leadId: lead.id,
          userId: lead.lastContactedBy,
          campaignId: lead.campaignId,
          commission: commission,
          multiDeals: multiDeals,
          orderDate: orderDateField?.value || lead.lastUpdatedTime,
          status: lead.status
        };
      });

      // Filter out deals without userId (required field)
      const validDeals = deals.filter(deal => deal.userId != null);
      const skippedDeals = deals.length - validDeals.length;

      if (skippedDeals > 0) {
        console.log(`⚠️  Skipped ${skippedDeals} deals without user_id`);
      }

      // Batch insert/update to PostgreSQL
      await db.batchInsertDeals(validDeals.map(d => this.cacheToDb(d)));

      // Reload today's cache (in case new deals are for today)
      await this.loadTodayCache();

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

        return {
          leadId: lead.id,
          userId: lead.lastContactedBy,
          campaignId: lead.campaignId,
          commission: commission,
          multiDeals: multiDeals,
          orderDate: orderDateField?.value || lead.lastUpdatedTime,
          status: lead.status
        };
      });

      // Filter out deals without userId (required field)
      const validDeals = deals.filter(deal => deal.userId != null);
      const skippedDeals = deals.length - validDeals.length;

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

      // Reload today's cache
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

    // If query is entirely for today → use cache
    if (start >= todayStart && end <= todayEnd) {
      return Array.from(this.todayCache.values()).filter(deal => {
        const dealDate = new Date(deal.orderDate);
        return dealDate >= start && dealDate <= end;
      });
    }

    // Otherwise → query PostgreSQL
    const dbDeals = await db.getDealsInRange(start, end);
    return dbDeals.map(d => this.dbToCache(d));
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
   * Invalidate cache (reload from DB)
   */
  async invalidateCache() {
    console.log('🔄 Invalidating cache, reloading from DB...');
    await this.loadTodayCache();
  }
}

module.exports = new DealsCache();
