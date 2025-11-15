const express = require('express');
const router = express.Router();
const db = require('../../services/postgres');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const loginTimeCache = require('../../services/loginTimeCache');
const leaderboardCache = require('../../services/leaderboardCache');
const adversusAPI = require('../../services/adversusAPI');
const centralSyncScheduler = require('../../services/centralSyncScheduler');

/**
 * ADMIN ENDPOINTS
 * - Duplicate management
 * - Database synchronization
 * - Cache management
 */

// ==================== DUPLICATE MANAGEMENT ====================

/**
 * GET /admin/duplicates/pending
 * Get all pending duplicates awaiting manual resolution
 */
router.get('/duplicates/pending', async (req, res) => {
  try {
    const pending = await db.getPendingDuplicates();

    res.json({
      success: true,
      pending,
      count: pending.length
    });
  } catch (error) {
    console.error('❌ Error fetching pending duplicates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/duplicates/:id
 * Get specific pending duplicate by ID
 */
router.get('/duplicates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const duplicate = await db.getPendingDuplicate(id);

    if (!duplicate) {
      return res.status(404).json({
        success: false,
        error: 'Pending duplicate not found'
      });
    }

    res.json({
      success: true,
      duplicate
    });
  } catch (error) {
    console.error('❌ Error fetching pending duplicate:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/duplicates/:id/resolve
 * Resolve a pending duplicate
 *
 * Body:
 * {
 *   action: 'approve' | 'replace' | 'reject' | 'merge',
 *   note: 'Optional note',
 *   adminName: 'Admin username'
 * }
 */
router.post('/duplicates/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note, adminName } = req.body;

    // Validate action
    const validActions = ['approve', 'replace', 'reject', 'merge'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`
      });
    }

    // Get pending duplicate
    const pending = await db.getPendingDuplicate(id);
    if (!pending) {
      return res.status(404).json({
        success: false,
        error: 'Pending duplicate not found'
      });
    }

    // JSONB columns are automatically parsed by pg library, no need to JSON.parse
    const newDealData = pending.new_data;

    // Execute action
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      switch (action) {
        case 'approve':
          // IMPORTANT: With UNIQUE constraint on lead_id, we can't have two deals with same lead_id
          // "Approve" now means: Replace old with new (keep new, delete old)
          // This is effectively same as "replace" action

          // Delete old deal
          await client.query('DELETE FROM deals WHERE id = $1', [pending.existing_deal_id]);

          // Insert new deal using client (within transaction)
          await client.query(
            `INSERT INTO deals (lead_id, user_id, campaign_id, commission, multi_deals, order_date, status, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              newDealData.leadId,
              newDealData.userId,
              newDealData.campaignId,
              newDealData.commission,
              newDealData.multiDeals || 1,
              newDealData.orderDate,
              newDealData.status
            ]
          );

          console.log(`✅ Approved (replaced old with new): ${pending.lead_id}`);
          break;

        case 'replace':
          // Delete old deal, insert new
          await client.query('DELETE FROM deals WHERE id = $1', [pending.existing_deal_id]);

          // Insert new deal using client (within transaction)
          await client.query(
            `INSERT INTO deals (lead_id, user_id, campaign_id, commission, multi_deals, order_date, status, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              newDealData.leadId,
              newDealData.userId,
              newDealData.campaignId,
              newDealData.commission,
              newDealData.multiDeals || 1,
              newDealData.orderDate,
              newDealData.status
            ]
          );

          console.log(`🔄 Replaced old deal with new: ${pending.lead_id}`);
          break;

        case 'reject':
          // Do nothing - keep old deal, reject new
          console.log(`❌ Rejected duplicate: ${pending.lead_id}`);
          break;

        case 'merge':
          // Update existing deal with new values using client (within transaction)
          await client.query(
            `UPDATE deals
             SET commission = $1, order_date = $2, multi_deals = $3, status = $4, synced_at = NOW()
             WHERE id = $5`,
            [
              newDealData.commission,
              newDealData.orderDate,
              newDealData.multiDeals || 1,
              newDealData.status,
              pending.existing_deal_id
            ]
          );
          console.log(`🔀 Merged duplicate data: ${pending.lead_id}`);
          break;
      }

      // Mark as resolved using client (within transaction)
      await client.query(
        `UPDATE pending_duplicates
         SET status = 'resolved', resolution = $1, resolved_by = $2, resolved_at = NOW(), resolution_note = $3
         WHERE id = $4`,
        [action, adminName || 'Unknown', note || '', id]
      );

      await client.query('COMMIT');

      // Invalidate cache to reflect changes
      await dealsCache.invalidateCache();

      res.json({
        success: true,
        action,
        message: `Duplicate ${action}ed successfully`
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error resolving duplicate:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/duplicates/history
 * Get resolved duplicates history
 */
router.get('/duplicates/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const history = await db.getDuplicateHistory(parseInt(limit));

    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('❌ Error fetching duplicate history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DATABASE SYNCHRONIZATION ====================

/**
 * POST /admin/sync-database
 * Synchronize database from Adversus
 *
 * Body:
 * {
 *   mode: 'full' | 'rolling',
 *   startDate: '2025-10-01',   // Optional for full mode
 *   endDate: '2025-10-31'      // Optional for full mode
 * }
 */
router.post('/sync-database', async (req, res) => {
  try {
    const { mode, startDate, endDate } = req.body;

    if (!mode || !['full', 'rolling'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode. Must be "full" or "rolling"'
      });
    }

    if (mode === 'full') {
      // Full resync - truncate and reload
      console.log('🗑️  TRUNCATING all tables for full resync...');

      await db.query('TRUNCATE TABLE deals CASCADE');
      await db.query('TRUNCATE TABLE sms_messages CASCADE');
      await db.query('TRUNCATE TABLE pending_duplicates CASCADE');

      console.log('✅ Truncate complete - all tables empty');

      // Determine date range
      const rollingWindow = dealsCache.getRollingWindow();
      const start = startDate || rollingWindow.startDate.toISOString();
      const end = endDate || rollingWindow.endDate.toISOString();

      console.log(`📥 Fetching from Adversus: ${start} → ${end}`);

      // Fetch deals
      const dealsResult = await adversusAPI.getLeadsInDateRange(new Date(start), new Date(end));
      const leads = dealsResult.leads || [];

      console.log(`📊 Adversus returned ${leads.length} leads (before filtering)`);

      // Log first 5 lead IDs and their status for debugging
      if (leads.length > 0) {
        console.log('   First 5 leads from Adversus:');
        leads.slice(0, 5).forEach(lead => {
          console.log(`   - Lead ${lead.id}: status="${lead.status}", lastContactedBy=${lead.lastContactedBy}`);
        });
      }

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
      }).filter(deal => {
        // Skip deals without user_id
        if (deal.userId == null) {
          console.log(`⚠️  Skipping lead ${deal.leadId}: no userId`);
          return false;
        }

        // Skip deals where userId is not a valid integer (e.g. campaign name string)
        const userIdNum = parseInt(deal.userId);
        if (isNaN(userIdNum) || userIdNum.toString() !== deal.userId.toString()) {
          console.log(`⚠️  Skipping lead ${deal.leadId}: invalid userId "${deal.userId}" (expected integer, got ${typeof deal.userId})`);
          return false;
        }

        return true;
      });

      console.log(`📊 Filtered to ${deals.length} deals with user_id`);

      // Log today's deals specifically (for debugging)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayDeals = deals.filter(d => {
        const orderDate = new Date(d.orderDate);
        return orderDate >= todayStart && orderDate <= todayEnd;
      });

      if (todayDeals.length > 0) {
        console.log(`   📅 ${todayDeals.length} deals are from TODAY (${todayStart.toISOString().split('T')[0]}):`);
        todayDeals.forEach(d => {
          console.log(`      - Lead ${d.leadId}: user=${d.userId}, commission=${d.commission}, status="${d.status}"`);
        });
      }

      // NOTE: No need to delete deals - we already truncated the entire table
      console.log(`💾 Inserting ${deals.length} deals into empty database...`);

      await db.batchInsertDeals(deals);

      console.log(`✅ Batch insert complete`);

      // Fetch SMS
      const smsResult = await adversusAPI.getSMS({
        type: { $eq: 'outbound' },
        timestamp: { $gt: start, $lt: end }
      }, 1, 10000);

      const smsData = (smsResult.sms || [])
        .filter(sms => sms.status === 'delivered')
        .map(sms => ({
          id: sms.id,
          userId: parseInt(sms.userId),
          receiver: sms.receiver,
          timestamp: sms.timestamp,
          campaignId: sms.campaignId,
          leadId: sms.leadId,
          status: sms.status
        }));

      await db.batchInsertSMS(smsData);

      // Reload caches
      console.log('🔄 Reloading caches from database...');
      await dealsCache.invalidateCache();
      await smsCache.invalidateCache();

      console.log(`✅ Full sync complete: ${deals.length} deals, ${smsData.length} SMS`);

      res.json({
        success: true,
        message: 'Full sync completed',
        period: `${start} → ${end}`,
        deals: deals.length,
        sms: smsData.length
      });

    } else if (mode === 'rolling') {
      // Rolling window sync - delete and reload only rolling window data
      const rollingWindow = dealsCache.getRollingWindow();
      const startDate = rollingWindow.startDate;
      const endDate = rollingWindow.endDate;

      console.log(`🔄 Rolling window sync: ${startDate.toISOString()} → ${endDate.toISOString()}`);

      // Delete existing data in range
      await db.deleteDealsInRange(startDate, endDate);
      await db.deleteSMSInRange(startDate, endDate);

      // Re-sync from Adversus
      await dealsCache.forceSync(adversusAPI);
      await smsCache.forceSync(adversusAPI);

      res.json({
        success: true,
        message: 'Rolling window sync completed',
        period: `${startDate} → ${endDate}`
      });
    }
  } catch (error) {
    console.error('❌ Error syncing database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/sync-status
 * Get current sync status and statistics
 */
router.get('/sync-status', async (req, res) => {
  try {
    const dealsStats = await dealsCache.getStats();
    const smsStats = await smsCache.getStats();

    const pendingDuplicates = await db.getPendingDuplicates();

    res.json({
      success: true,
      deals: dealsStats,
      sms: smsStats,
      pendingDuplicates: pendingDuplicates.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching sync status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/sync-progress
 * Get historical sync progress (for live updates in admin UI)
 */
router.get('/sync-progress', async (req, res) => {
  try {
    const status = centralSyncScheduler.getStatus();

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching sync progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/sync-historical
 * Manually trigger historical data sync
 * Body: { days: 30 }
 */
router.post('/sync-historical', async (req, res) => {
  try {
    const { days = 30 } = req.body;

    // Validate days parameter
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Days must be between 1 and 365'
      });
    }

    console.log(`\n🔧 Manual historical sync triggered via API (${days} days)`);

    // Trigger sync (runs in background)
    centralSyncScheduler.triggerHistoricalSync(days)
      .then(() => {
        console.log('✅ Historical sync completed successfully');
      })
      .catch(error => {
        console.error('❌ Historical sync failed:', error);
      });

    // Return immediately with accepted status
    res.json({
      success: true,
      message: `Historical sync started for ${days} days`,
      estimatedMinutes: Math.ceil(days * 2 / 60),
      data: centralSyncScheduler.getStatus().historicalSync
    });
  } catch (error) {
    console.error('❌ Error triggering historical sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CACHE MANAGEMENT ====================

/**
 * POST /admin/cache/invalidate
 * Invalidate and reload caches
 */
router.post('/cache/invalidate', async (req, res) => {
  try {
    await dealsCache.invalidateCache();
    await smsCache.invalidateCache();
    await loginTimeCache.invalidateCache();
    leaderboardCache.clear(); // Clear leaderboard cache too

    res.json({
      success: true,
      message: 'All caches invalidated and reloaded from database'
    });
  } catch (error) {
    console.error('❌ Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Backfill login time for historical dates
 * POST /api/admin/backfill-login-time
 * Body: {
 *   days: 30  // How many days back to fetch
 * }
 */
router.post('/backfill-login-time', async (req, res) => {
  try {
    const { days = 30 } = req.body;

    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Days must be between 1 and 365'
      });
    }

    console.log(`🕐 Starting login time backfill for ${days} days...`);

    // Get all users
    const userCache = require('../../services/userCache');
    const adversusAPI = require('../../services/adversusAPI');
    const users = await userCache.getUsers({ adversusAPI });
    const userIds = users.map(u => u.id);

    console.log(`   👥 Found ${userIds.length} users`);

    // Calculate date range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    console.log(`   📅 Date range: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);

    // Fetch day by day to avoid rate limits
    const daysToFetch = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      daysToFetch.push({ start: new Date(dayStart), end: new Date(dayEnd) });
    }

    console.log(`   📊 Will fetch ${daysToFetch.length} days of data...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < daysToFetch.length; i++) {
      const { start, end } = daysToFetch[i];
      const dateStr = start.toISOString().split('T')[0];

      try {
        console.log(`   [${i + 1}/${daysToFetch.length}] Fetching ${dateStr}...`);

        await loginTimeCache.syncLoginTimeForUsers(adversusAPI, userIds, start, end);
        successCount++;

        console.log(`   ✅ ${dateStr} complete`);

        // Small delay to avoid rate limits (2 seconds between days)
        if (i < daysToFetch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Failed ${dateStr}:`, error.message);
      }
    }

    console.log(`🎉 Backfill complete! ${successCount} days succeeded, ${errorCount} failed`);

    res.json({
      success: true,
      message: `Login time backfilled for ${successCount}/${daysToFetch.length} days`,
      details: {
        totalDays: daysToFetch.length,
        successCount,
        errorCount,
        userCount: userIds.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error backfilling login time:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/cache/invalidate/:leaderboardId
 * Invalidate cache for a specific leaderboard
 */
router.post('/cache/invalidate/:leaderboardId', async (req, res) => {
  try {
    const { leaderboardId } = req.params;
    leaderboardCache.invalidate(leaderboardId);

    res.json({
      success: true,
      message: `Cache invalidated for leaderboard ${leaderboardId}`
    });
  } catch (error) {
    console.error('❌ Error invalidating leaderboard cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const leaderboardStats = leaderboardCache.getStats();
    const dealsStats = await dealsCache.getStats();
    const smsStats = await smsCache.getStats();
    const loginTimeStats = await loginTimeCache.getStats();

    res.json({
      success: true,
      leaderboards: leaderboardStats,
      deals: dealsStats,
      sms: smsStats,
      loginTime: loginTimeStats
    });
  } catch (error) {
    console.error('❌ Error fetching cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== LOGIN TIME CACHE MANAGEMENT ====================

/**
 * GET /admin/login-time/stats
 * Get login time cache statistics
 */
router.get('/login-time/stats', async (req, res) => {
  try {
    const stats = await loginTimeCache.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('❌ Error fetching login time stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/login-time/daily-breakdown
 * Get detailed breakdown of login time data per day (last 30 days)
 * Shows: date, user count, total hours, avg hours per user, deals, SMS
 */
router.get('/login-time/daily-breakdown', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const now = new Date();
    const breakdown = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      dayDate.setUTCDate(dayDate.getUTCDate() - i);

      const dayEnd = new Date(dayDate);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const dateStr = dayDate.toISOString().split('T')[0];

      // Get login time data for this day
      const loginQuery = `
        SELECT
          COUNT(DISTINCT user_id) as user_count,
          SUM(login_seconds) as total_login_seconds,
          AVG(login_seconds) as avg_login_seconds
        FROM user_login_time
        WHERE from_date = $1 AND to_date = $2
      `;

      const loginResult = await db.pool.query(loginQuery, [
        dayDate.toISOString(),
        dayEnd.toISOString()
      ]);

      const loginData = loginResult.rows[0];

      // Get deals count for this day
      const dealsQuery = `
        SELECT COUNT(*) as deal_count, SUM(CAST(multi_deals AS INTEGER)) as total_deals
        FROM deals
        WHERE created_at >= $1 AND created_at < $2
      `;

      const dealsResult = await db.pool.query(dealsQuery, [
        dayDate.toISOString(),
        dayEnd.toISOString()
      ]);

      const dealsData = dealsResult.rows[0];

      // Get SMS count for this day
      const smsQuery = `
        SELECT COUNT(*) as sms_count
        FROM sms
        WHERE created_at >= $1 AND created_at < $2
      `;

      const smsResult = await db.pool.query(smsQuery, [
        dayDate.toISOString(),
        dayEnd.toISOString()
      ]);

      const smsData = smsResult.rows[0];

      const totalHours = parseFloat(loginData.total_login_seconds || 0) / 3600;
      const avgHours = parseFloat(loginData.avg_login_seconds || 0) / 3600;
      const userCount = parseInt(loginData.user_count || 0);
      const totalDeals = parseInt(dealsData.total_deals || 0);
      const orderPerHour = totalHours > 0 ? totalDeals / totalHours : 0;

      breakdown.push({
        date: dateStr,
        userCount,
        totalHours: Math.round(totalHours * 100) / 100,
        avgHours: Math.round(avgHours * 100) / 100,
        totalDeals,
        smsCount: parseInt(smsData.sms_count || 0),
        orderPerHour: Math.round(orderPerHour * 100) / 100,
        hasData: userCount > 0
      });
    }

    res.json({
      success: true,
      data: {
        breakdown,
        summary: {
          daysWithData: breakdown.filter(d => d.hasData).length,
          totalDays: days,
          completeness: Math.round((breakdown.filter(d => d.hasData).length / days) * 100)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching daily breakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/login-time/stats
 * Get login time cache statistics (OLD - kept for backwards compatibility)
 */
router.get('/login-time/stats-old', async (req, res) => {
  try {
    const stats = await loginTimeCache.getStats();

    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('❌ Error fetching login time stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/login-time/sync
 * Manually sync login time for all active users
 */
router.post('/login-time/sync', async (req, res) => {
  try {
    // Get all active agents
    const agentsResult = await db.query('SELECT adversus_user_id FROM agents WHERE active = true');
    const userIds = agentsResult.rows.map(row => row.adversus_user_id.toString());

    if (userIds.length === 0) {
      return res.json({
        success: true,
        message: 'No active agents to sync',
        synced: 0
      });
    }

    // Get rolling window dates
    const rollingWindow = dealsCache.getRollingWindow();

    // Sync login time
    await loginTimeCache.forceSync(adversusAPI, userIds, rollingWindow.startDate, rollingWindow.endDate);

    res.json({
      success: true,
      message: 'Login time synced successfully',
      synced: userIds.length
    });
  } catch (error) {
    console.error('❌ Error syncing login time:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/login-time/database
 * Clear login time database completely
 */
router.delete('/login-time/database', async (req, res) => {
  try {
    await loginTimeCache.clearDatabase();

    res.json({
      success: true,
      message: 'Login time database cleared'
    });
  } catch (error) {
    console.error('❌ Error clearing login time database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
