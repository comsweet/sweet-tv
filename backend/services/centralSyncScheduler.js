const adversusAPI = require('./adversusAPI');
const dealsCache = require('./dealsCache');
const smsCache = require('./smsCache');
const loginTimeCache = require('./loginTimeCache');

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

    this.syncIntervalMinutes = 3;
    this.syncTimer = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncCount = 0;
  }

  /**
   * Start the scheduler
   */
  start() {
    console.log(`⏰ Starting central sync every ${this.syncIntervalMinutes} minutes...`);

    // Run first sync immediately
    this.runSync();

    // Then schedule recurring syncs
    this.syncTimer = setInterval(() => {
      this.runSync();
    }, this.syncIntervalMinutes * 60 * 1000);
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

      // 3. Sync login time cache
      console.log('\n⏱️  [3/3] Syncing login time cache...');
      try {
        if (await loginTimeCache.needsSync()) {
          // Get all active users
          const usersResult = await adversusAPI.getUsers();
          const users = usersResult.users || [];
          const activeUserIds = users.map(u => u.id);

          if (activeUserIds.length > 0) {
            // Calculate date range (today)
            const now = new Date();
            const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
            const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

            console.log(`   📅 Date range: ${startDate.toISOString()} → ${endDate.toISOString()}`);
            console.log(`   👥 Syncing login time for ${activeUserIds.length} users...`);

            await loginTimeCache.syncLoginTimeForUsers(adversusAPI, activeUserIds, startDate, endDate);
            console.log('✅ Login time cache synced');
          } else {
            console.log('⚠️  No active users found, skipping login time sync');
          }
        } else {
          console.log('✅ Login time cache is fresh (no sync needed)');
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
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.syncTimer !== null,
      isSyncing: this.isSyncing,
      syncIntervalMinutes: this.syncIntervalMinutes,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount
    };
  }
}

module.exports = new CentralSyncScheduler();
