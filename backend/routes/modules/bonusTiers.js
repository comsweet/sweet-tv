const express = require('express');
const router = express.Router();
const bonusTiers = require('../../services/bonusTiers');
const leaderboardCache = require('../../services/leaderboardCache');

// ==================== BONUS TIERS ====================

// Get all bonus tiers
router.get('/', async (req, res) => {
  try {
    const tiers = bonusTiers.getTiers();
    res.json({ success: true, tiers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single bonus tier
router.get('/:id', async (req, res) => {
  try {
    const tier = bonusTiers.getTier(req.params.id);
    if (!tier) {
      return res.status(404).json({ error: 'Bonus tier not found' });
    }
    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create bonus tier
router.post('/', async (req, res) => {
  try {
    const tier = await bonusTiers.addTier(req.body);

    // Invalidate leaderboard cache since bonus calculations will change
    leaderboardCache.clear();

    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update bonus tier
router.put('/:id', async (req, res) => {
  try {
    const tier = await bonusTiers.updateTier(req.params.id, req.body);

    // Invalidate leaderboard cache
    leaderboardCache.clear();

    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete bonus tier
router.delete('/:id', async (req, res) => {
  try {
    await bonusTiers.deleteTier(req.params.id);

    // Invalidate leaderboard cache
    leaderboardCache.clear();

    res.json({ success: true, message: 'Bonus tier deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bonus tiers stats
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await bonusTiers.getTiersStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
