const express = require('express');
const router = express.Router();
const campaignBonusTiers = require('../../services/campaignBonusTiers');
const leaderboardCache = require('../../services/leaderboardCache');

// ==================== CAMPAIGN BONUS TIERS ====================

// Get all campaign bonus tiers
router.get('/', async (req, res) => {
  try {
    const tiers = campaignBonusTiers.getTiers();
    res.json({ success: true, tiers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single campaign bonus tier
router.get('/:id', async (req, res) => {
  try {
    const tier = campaignBonusTiers.getTier(req.params.id);
    if (!tier) {
      return res.status(404).json({ error: 'Campaign bonus tier not found' });
    }
    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create campaign bonus tier
router.post('/', async (req, res) => {
  try {
    const tier = await campaignBonusTiers.addTier(req.body);

    // Invalidate leaderboard cache since bonus calculations will change
    leaderboardCache.clear();

    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update campaign bonus tier
router.put('/:id', async (req, res) => {
  try {
    const tier = await campaignBonusTiers.updateTier(req.params.id, req.body);

    // Invalidate leaderboard cache
    leaderboardCache.clear();

    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete campaign bonus tier
router.delete('/:id', async (req, res) => {
  try {
    await campaignBonusTiers.deleteTier(req.params.id);

    // Invalidate leaderboard cache
    leaderboardCache.clear();

    res.json({ success: true, message: 'Campaign bonus tier deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get campaign bonus tiers stats
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = campaignBonusTiers.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate bonus for specific campaign group and deal count (preview)
router.post('/calculate', async (req, res) => {
  try {
    const { campaignGroup, dealsCount } = req.body;

    if (!campaignGroup || dealsCount === undefined) {
      return res.status(400).json({ error: 'Missing campaignGroup or dealsCount' });
    }

    const bonus = campaignBonusTiers.calculateBonusForDeals(campaignGroup, dealsCount);
    const info = campaignBonusTiers.getTierInfoForDeals(campaignGroup, dealsCount);

    res.json({ success: true, bonus, info });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
