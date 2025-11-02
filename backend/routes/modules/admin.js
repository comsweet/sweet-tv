const express = require('express');
const router = express.Router();
const db = require('../../services/postgres');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');

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
          // Insert new deal (allow duplicate)
          await db.insertDeal({
            leadId: newDealData.leadId,
            userId: newDealData.userId,
            campaignId: newDealData.campaignId,
            commission: newDealData.commission,
            multiDeals: newDealData.multiDeals,
            orderDate: newDealData.orderDate,
            status: newDealData.status
          });
          console.log(`✅ Approved duplicate: ${pending.lead_id}`);
          break;

        case 'replace':
          // Mark old deal as replaced
          await client.query(
            `UPDATE deals
             SET is_duplicate = TRUE,
                 replaced_by = (
                   SELECT id FROM deals WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1
                 )
             WHERE id = $2`,
            [newDealData.leadId, pending.existing_deal_id]
          );

          // Insert new deal
          await db.insertDeal({
            leadId: newDealData.leadId,
            userId: newDealData.userId,
            campaignId: newDealData.campaignId,
            commission: newDealData.commission,
            multiDeals: newDealData.multiDeals,
            orderDate: newDealData.orderDate,
            status: newDealData.status
          });

          console.log(`🔄 Replaced old deal with new: ${pending.lead_id}`);
          break;

        case 'reject':
          // Do nothing - keep old deal, reject new
          console.log(`❌ Rejected duplicate: ${pending.lead_id}`);
          break;

        case 'merge':
          // Update existing deal with new values
          await db.updateDeal(pending.existing_deal_id, {
            commission: newDealData.commission,
            orderDate: newDealData.orderDate,
            multiDeals: newDealData.multiDeals,
            status: newDealData.status
          });
          console.log(`🔀 Merged duplicate data: ${pending.lead_id}`);
          break;
      }

      // Mark as resolved
      await db.resolvePendingDuplicate(id, action, adminName || 'Unknown', note || '');

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

    const adversusAPI = req.app.get('adversusAPI');
    if (!adversusAPI) {
      return res.status(500).json({
        success: false,
        error: 'Adversus API not available'
      });
    }

    if (mode === 'full') {
      // Full resync - truncate and reload
      console.log('🗑️  TRUNCATING all tables for full resync...');

      await db.query('TRUNCATE TABLE deals CASCADE');
      await db.query('TRUNCATE TABLE sms_messages CASCADE');
      await db.query('TRUNCATE TABLE pending_duplicates CASCADE');

      // Determine date range
      const { startDate: rollingStart, endDate: rollingEnd } = dealsCache.getRollingWindow();
      const start = startDate || rollingStart;
      const end = endDate || rollingEnd;

      console.log(`📥 Fetching from Adversus: ${start} → ${end}`);

      // Fetch deals
      const dealsResult = await adversusAPI.getLeadsInDateRange(new Date(start), new Date(end));
      const leads = dealsResult.leads || [];

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

      await db.batchInsertDeals(deals);

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
      await dealsCache.invalidateCache();
      await smsCache.invalidateCache();

      res.json({
        success: true,
        message: 'Full sync completed',
        period: `${start} → ${end}`,
        deals: deals.length,
        sms: smsData.length
      });

    } else if (mode === 'rolling') {
      // Rolling window sync - delete and reload only rolling window data
      const { startDate, endDate } = dealsCache.getRollingWindow();

      console.log(`🔄 Rolling window sync: ${startDate} → ${endDate}`);

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
