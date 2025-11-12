const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const smsCache = require('../../services/smsCache');
const postgres = require('../../services/postgres');

// ==================== SMS MANAGEMENT ====================

// Manual sync SMS from Adversus
router.post('/sync', async (req, res) => {
  try {
    console.log('🔄 Manual SMS sync triggered');
    await smsCache.forceSync(adversusAPI);

    res.json({
      success: true,
      message: 'SMS cache synced'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMS cache stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await smsCache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMS data for specific agent
router.get('/agent/:userId', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const userId = parseInt(req.params.userId);

    const smsData = await smsCache.getSMSSuccessRate(userId, start, end, 0);

    res.json(smsData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clean old SMS data
router.post('/clean', async (req, res) => {
  try {
    await smsCache.cleanOldSMS();
    const stats = await smsCache.getStats();

    res.json({
      success: true,
      message: 'Cleaned old SMS data',
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear SMS cache (invalidate in-memory cache, reload from DB)
router.delete('/cache', async (req, res) => {
  try {
    // With PostgreSQL, "clear cache" means invalidate in-memory cache
    // and reload today's data from database
    await smsCache.invalidateCache();
    console.log('✅ Invalidated SMS cache and reloaded from PostgreSQL');

    const stats = await smsCache.getStats();

    res.json({
      success: true,
      message: 'SMS cache invalidated and reloaded from database',
      stats
    });
  } catch (error) {
    console.error('❌ Error invalidating SMS cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== GLOBAL SMS NOTIFICATIONS ====================

// Get recent SMS globally (all groups except blocklisted)
router.get('/global/recent', async (req, res) => {
  try {
    const { minutes = 2 } = req.query;

    // Calculate date range (last N minutes)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - parseInt(minutes));

    // Get SMS from cache
    const cachedSMS = await smsCache.getSMSInRange(startDate, endDate);

    // Get blocklist
    const blocklistResult = await postgres.query('SELECT group_id FROM sms_notification_blocklist');
    const blockedGroupIds = blocklistResult.rows.map(row => String(row.group_id));

    // Get users
    let adversusUsers = [];
    try {
      const usersResult = await adversusAPI.getUsers();
      adversusUsers = usersResult.users || [];
    } catch (error) {
      console.error('⚠️ Failed to load Adversus users:', error.message);
    }

    // Filter out blocklisted groups
    const allowedUserIds = adversusUsers
      .filter(u => {
        if (!u.group || !u.group.id) return true; // Include users without groups
        return !blockedGroupIds.includes(String(u.group.id));
      })
      .map(u => String(u.id));

    const filteredSMS = cachedSMS.filter(sms =>
      allowedUserIds.includes(String(sms.userId))
    );

    // Format SMS for display
    const recentSMS = filteredSMS.map(sms => {
      const user = adversusUsers.find(u => String(u.id) === String(sms.userId));
      return {
        id: sms.id,
        userId: sms.userId,
        userName: user?.name || user?.firstname || `Agent ${sms.userId}`,
        receiver: sms.receiver,
        timestamp: sms.timestamp,
        status: sms.status,
        groupName: user?.group?.name || null
      };
    });

    res.json({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      sms: recentSMS,
      totalCount: recentSMS.length
    });
  } catch (error) {
    console.error('❌ Error fetching global recent SMS:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SMS NOTIFICATION BLOCKLIST ====================

// Get all blocked groups
router.get('/blocklist', async (req, res) => {
  try {
    const result = await postgres.query(
      'SELECT * FROM sms_notification_blocklist ORDER BY group_name'
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('❌ Error fetching SMS blocklist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add group to blocklist
router.post('/blocklist', async (req, res) => {
  try {
    const { groupId, groupName } = req.body;

    if (!groupId || !groupName) {
      return res.status(400).json({ error: 'groupId and groupName are required' });
    }

    // Check if already exists
    const checkResult = await postgres.query(
      'SELECT * FROM sms_notification_blocklist WHERE group_id = $1',
      [groupId]
    );

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'Group already in blocklist' });
    }

    // Insert
    const result = await postgres.query(
      'INSERT INTO sms_notification_blocklist (group_id, group_name) VALUES ($1, $2) RETURNING *',
      [groupId, groupName]
    );

    console.log(`✅ Added group ${groupName} (${groupId}) to SMS blocklist`);

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error adding to SMS blocklist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove group from blocklist
router.delete('/blocklist/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await postgres.query(
      'DELETE FROM sms_notification_blocklist WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Blocklist entry not found' });
    }

    console.log(`✅ Removed group ${result.rows[0].group_name} from SMS blocklist`);

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error removing from SMS blocklist:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
