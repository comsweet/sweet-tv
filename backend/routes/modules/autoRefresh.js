const express = require('express');
const router = express.Router();
const autoRefreshSettings = require('../../services/autoRefreshSettings');

// ==================== AUTO-REFRESH SETTINGS ====================

// Get auto-refresh settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await autoRefreshSettings.getSettings();
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update auto-refresh settings
router.post('/settings', async (req, res) => {
  try {
    const settings = await autoRefreshSettings.updateSettings(req.body);
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset auto-refresh settings to defaults
router.post('/settings/reset', async (req, res) => {
  try {
    const settings = await autoRefreshSettings.resetSettings();
    res.json({
      success: true,
      settings,
      message: 'Auto-refresh settings reset to defaults'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
