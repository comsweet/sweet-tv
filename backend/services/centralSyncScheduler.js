const adversusAPI = require('./adversusAPI');
const dealsCache = require('./dealsCache');
const smsCache = require('./smsCache');
const loginTimeCache = require('./loginTimeCache');
const userCache = require('./userCache');

/**
 * CENTRAL SYNC SCHEDULER
 *
 * Syncs all data caches centrally every 3 minutes
 * This prevents rate limiting by avoiding burst requests from multiple leaderboards
 *
 * Benefits:
 * - Single sync point for all data
 * - Predictable API usage
 * - All leaderboards see consistent data at the same time
 * - 90% reduction in API calls (1 sync vs 10 individual syncs)
 *
 * Syncs:
 * - Deals cache (autoSync - polls for new deals)
 * - SMS cache (autoSync - polls for new SMS)
 * - Login time cache (batch sync for all active users)
 */
class CentralSyncScheduler {
  constructor() {
    console.log('🔄 Central Sync Scheduler initialized');

    this.syncIntervalMinutes = 0.25; // 15 seconds for ultra-live data (prevents "0 order/h" race condition)
    this.syncTimer = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncCount = 0;
    this.isReady = false; // Track if initial sync is complete

    // Progress tracking for historical sync
    this.syncProgress = {
      isRunning: false,
      stage: 'idle', // idle, syncing_login_time, complete, error
      totalDays: 0,
      completedDays: 0,
      currentDay: null,
      startTime: null,
      estimatedTimeRemaining: null,
      errors: []
    };
  }

  /**
   * Start the scheduler
   */
  async start() {
    console.log(`⏰ Starting central sync every ${this.syncIntervalMinutes} minutes...`);

    // First: Sync historical data (30 days) ONCE at startup
    await this.syncHistoricalData();

    // Then: Run first sync of today's data and wait for it to complete
    await this.runSync();
    this.isReady = true;
    console.log('✅ Central sync is READY - all endpoints can now safely use cached data');

    // Finally: Schedule recurring syncs (today only)
    this.syncTimer = setInterval(() => {
      this.runSync();
    }, this.syncIntervalMinutes * 60 * 1000);
  }

  /**
   * Sync historical data (30 days) - ALL data types
   * Called ONCE at startup OR manually from admin UI
   *
   * Syncs day-by-day with progress tracking and rate limit safety:
   * - LoginTime: 1 API call per day (workforce API for all users)
   * - 2 second delay between days to avoid burst limit
   * - Progress tracking for UI
   */
  async syncHistoricalData(days = 30) {
    console.log('\n' + '='.repeat(60));
    console.log(`📚 HISTORICAL DATA SYNC - ${days} days`);
    console.log('='.repeat(60));

    // Reset progress
    this.syncProgress = {
      isRunning: true,
      stage: 'initializing',
      totalDays: days,
      completedDays: 0,
      currentDay: null,
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      errors: []
    };

    try {
      // Get all active users
      this.syncProgress.stage = 'fetching_users';
      const usersResult = await adversusAPI.getUsers();
      const users = usersResult.users || [];
      const activeUserIds = users.map(u => u.id);

      if (activeUserIds.length === 0) {
        console.log('⚠️  No active users found, skipping historical sync');
        this.syncProgress.isRunning = false;
        this.syncProgress.stage = 'complete';
        return;
      }

      console.log(`\n👥 Found ${activeUserIds.length} active users`);
      console.log(`📅 Syncing ${days} days of historical data`);
      console.log(`⏱️  Estimated time: ~${Math.ceil(days * 2 / 60)} minutes (2s delay per day)\n`);

      // Calculate date range
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

      // Sync day by day (oldest to newest)
      this.syncProgress.stage = 'syncing_login_time';
      let syncedDays = 0;
      let skippedDays = 0;

      for (let i = days - 1; i >= 0; i--) {
        const dayDate = new Date(today);
        dayDate.setUTCDate(dayDate.getUTCDate() - i);
        dayDate.setUTCHours(0, 0, 0, 0);

        const dayEnd = new Date(dayDate);
        dayEnd.setUTCHours(23, 59, 59, 999);

        const dayStr = dayDate.toISOString().split('T')[0];
        this.syncProgress.currentDay = dayStr;

        console.log(`\n📅 Day ${days - i}/${days}: ${dayStr}`);

        try {
          // Check if we already have data for this day in DB
          const hasData = await loginTimeCache.hasDayInDB(activeUserIds[0], dayDate, dayEnd);

          if (hasData) {
            console.log(`   ✅ Data already in DB, skipping`);
            skippedDays++;
          } else {
            console.log(`   🏭 Fetching from Adversus workforce API...`);

            // Sync login time for this single day (all users at once)
            await loginTimeCache.syncLoginTimeForUsers(adversusAPI, activeUserIds, dayDate, dayEnd);

            console.log(`   ✅ Synced successfully`);
            syncedDays++;

            // Rate limit protection: 2 second delay between days
            if (i > 0) {
              console.log(`   ⏳ Waiting 2s before next day (rate limit protection)...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }

          this.syncProgress.completedDays++;

          // Update ETA
          const elapsed = Date.now() - this.syncProgress.startTime;
          const avgTimePerDay = elapsed / this.syncProgress.completedDays;
          const remainingDays = days - this.syncProgress.completedDays;
          this.syncProgress.estimatedTimeRemaining = Math.ceil(avgTimePerDay * remainingDays / 1000);

        } catch (error) {
          console.error(`   ❌ Failed to sync ${dayStr}:`, error.message);
          this.syncProgress.errors.push({
            day: dayStr,
            error: error.message
          });
        }
      }

      const duration = Date.now() - this.syncProgress.startTime;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ HISTORICAL SYNC COMPLETE`);
      console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`   Synced: ${syncedDays} days (${skippedDays} already in DB)`);
      if (this.syncProgress.errors.length > 0) {
        console.log(`   ⚠️  Errors: ${this.syncProgress.errors.length} days failed`);
      }
      console.log(`${'='.repeat(60)}\n`);

      this.syncProgress.stage = 'complete';
      this.syncProgress.isRunning = false;

    } catch (error) {
      console.error('❌ CRITICAL: Historical sync failed:', error);
      this.syncProgress.stage = 'error';
      this.syncProgress.isRunning = false;
      this.syncProgress.errors.push({
        day: 'startup',
        error: error.message
      });
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('⏸️  Central sync stopped');
    }
  }

  /**
   * Run sync for all caches
   */
  async runSync() {
    // Prevent overlapping syncs
    if (this.isSyncing) {
      console.log('⚠️  Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.syncCount++;
    const startTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log(`🔄 CENTRAL SYNC #${this.syncCount} - ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    try {
      // 1. Sync deals cache
      console.log('\n📊 [1/3] Syncing deals cache...');
      try {
        await dealsCache.autoSync(adversusAPI);
        console.log('✅ Deals cache synced');
      } catch (error) {
        console.error('❌ Failed to sync deals:', error.message);
      }

      // 2. Sync SMS cache
      console.log('\n💬 [2/3] Syncing SMS cache...');
      try {
        await smsCache.autoSync(adversusAPI);
        console.log('✅ SMS cache synced');
      } catch (error) {
        console.error('❌ Failed to sync SMS:', error.message);
      }

      // 3. Sync users cache and login time cache
      console.log('\n⏱️  [3/4] Syncing users cache...');
      try {
        // Get all active users and update user cache
        const usersResult = await adversusAPI.getUsers();
        const users = usersResult.users || [];

        // Update global user cache
        userCache.update(users);
        console.log('✅ User cache updated');

        // 4. Sync login time cache
        console.log('\n⏱️  [4/4] Syncing login time cache...');
        const activeUserIds = users.map(u => u.id);

        if (activeUserIds.length > 0) {
          const now = new Date();
          const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
          const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

          console.log(`   📅 Date range: ${todayStart.toISOString().split('T')[0]} (today only)`);
          console.log(`   👥 Syncing login time for ${activeUserIds.length} users...`);

          // Only sync TODAY every 30 seconds (historical data is cached permanently in DB)
          await loginTimeCache.syncLoginTimeForUsers(adversusAPI, activeUserIds, todayStart, todayEnd);
          console.log('✅ Login time cache synced for all users (today)');
        } else {
          console.log('⚠️  No active users found, skipping login time sync');
        }
      } catch (error) {
        console.error('❌ Failed to sync login time:', error.message);
      }

      const duration = Date.now() - startTime;
      this.lastSyncTime = new Date();

      console.log('\n' + '='.repeat(60));
      console.log(`✅ CENTRAL SYNC COMPLETED in ${(duration / 1000).toFixed(1)}s`);
      console.log(`   Next sync in ${this.syncIntervalMinutes} minutes`);
      console.log('='.repeat(60) + '\n');

    } catch (error) {
      console.error('❌ Central sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Force sync (for admin panel)
   */
  async forceSync() {
    console.log('🔄 FORCE SYNC initiated from admin');
    return await this.runSync();
  }

  /**
   * Get sync status including historical sync progress
   */
  getStatus() {
    return {
      isRunning: this.syncTimer !== null,
      isSyncing: this.isSyncing,
      isReady: this.isReady,
      syncIntervalMinutes: this.syncIntervalMinutes,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      historicalSync: {
        isRunning: this.syncProgress.isRunning,
        stage: this.syncProgress.stage,
        totalDays: this.syncProgress.totalDays,
        completedDays: this.syncProgress.completedDays,
        currentDay: this.syncProgress.currentDay,
        progressPercent: this.syncProgress.totalDays > 0
          ? Math.round((this.syncProgress.completedDays / this.syncProgress.totalDays) * 100)
          : 0,
        estimatedTimeRemaining: this.syncProgress.estimatedTimeRemaining,
        errors: this.syncProgress.errors
      }
    };
  }

  /**
   * Manually trigger historical sync from admin UI
   */
  async triggerHistoricalSync(days = 30) {
    if (this.syncProgress.isRunning) {
      throw new Error('Historical sync is already running');
    }

    console.log(`\n🔧 Manual historical sync triggered from admin UI (${days} days)`);
    await this.syncHistoricalData(days);

    return this.syncProgress;
  }
}

module.exports = new CentralSyncScheduler();
