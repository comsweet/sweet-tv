const express = require('express');
const router = express.Router();
const notificationSettings = require('../../services/notificationSettings');

// ==================== NOTIFICATION SETTINGS ====================

// Get notification settings
router.get('/', async (req, res) => {
  try {
    const settings = await notificationSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update notification settings
router.post('/', async (req, res) => {
  try {
    const settings = await notificationSettings.updateSettings(req.body);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle group in notification settings
router.post('/toggle-group', async (req, res) => {
  try {
    const { groupId } = req.body;
    const settings = await notificationSettings.toggleGroup(groupId);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update notification mode
router.post('/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const settings = await notificationSettings.updateMode(mode);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
