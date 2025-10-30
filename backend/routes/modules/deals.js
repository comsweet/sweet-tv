const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const dealsCache = require('../../services/dealsCache');
const leaderboardCache = require('../../services/leaderboardCache');

// ==================== DEALS MANAGEMENT ====================

// Manual sync deals from Adversus
router.post('/sync', async (req, res) => {
  try {
    console.log('🔄 Manual deals sync triggered from admin');
    const deals = await dealsCache.forceSync(adversusAPI);

    leaderboardCache.clear();

    res.json({
      success: true,
      message: `Synced ${deals.length} deals and cleared cache`,
      deals: deals.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deals cache stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await dealsCache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clean old deals
router.post('/clean', async (req, res) => {
  try {
    await dealsCache.cleanOldDeals();
    const stats = await dealsCache.getStats();
    res.json({
      success: true,
      message: 'Cleaned old deals',
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear deals database
router.delete('/database', async (req, res) => {
  try {
    await dealsCache.saveCache([]);
    console.log('✅ Cleared deals-cache.json');

    res.json({
      success: true,
      message: 'Cleared deals cache (deals-cache.json)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
