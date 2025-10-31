const express = require('express');
const router = express.Router();
const thresholdsService = require('../../services/thresholds');

// ==================== THRESHOLDS ====================

// Get all thresholds
router.get('/', async (req, res) => {
  try {
    const thresholds = await thresholdsService.getThresholds();
    res.json(thresholds);
  } catch (error) {
    console.error('❌ Error getting thresholds:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get thresholds for specific time period
router.get('/:timePeriod', async (req, res) => {
  try {
    const { timePeriod } = req.params;
    const thresholds = await thresholdsService.getThresholdsForPeriod(timePeriod);
    res.json(thresholds);
  } catch (error) {
    console.error('❌ Error getting thresholds for period:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update thresholds for specific time period
router.put('/:timePeriod', async (req, res) => {
  try {
    const { timePeriod } = req.params;
    const newThresholds = req.body;

    const updated = await thresholdsService.updateThresholds(timePeriod, newThresholds);
    res.json({
      success: true,
      thresholds: updated
    });
  } catch (error) {
    console.error('❌ Error updating thresholds:', error);
    res.status(400).json({ error: error.message });
  }
});

// Reset thresholds to defaults
router.post('/reset', async (req, res) => {
  try {
    const thresholds = await thresholdsService.reset();
    res.json({
      success: true,
      thresholds
    });
  } catch (error) {
    console.error('❌ Error resetting thresholds:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
