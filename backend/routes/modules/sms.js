const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const smsCache = require('../../services/smsCache');

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

// Clear SMS cache
router.delete('/cache', async (req, res) => {
  try {
    await smsCache.saveCache([]);
    console.log('✅ Cleared sms-cache.json');

    res.json({
      success: true,
      message: 'Cleared SMS cache'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
