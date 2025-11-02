const express = require('express');
const router = express.Router();
const db = require('../../services/postgres');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const adversusAPI = require('../../services/adversusAPI');

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

    const newDealData = JSON.parse(pending.new_data);

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
      }).filter(deal => deal.userId != null); // Skip deals without user_id

      console.log(`📊 Filtered to ${deals.length} deals with user_id`);

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

// ==================== CACHE MANAGEMENT ====================

/**
 * POST /admin/cache/invalidate
 * Invalidate and reload caches
 */
router.post('/cache/invalidate', async (req, res) => {
  try {
    await dealsCache.invalidateCache();
    await smsCache.invalidateCache();

    res.json({
      success: true,
      message: 'Caches invalidated and reloaded from database'
    });
  } catch (error) {
    console.error('❌ Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
