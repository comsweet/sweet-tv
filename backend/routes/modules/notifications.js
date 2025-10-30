const express = require('express');
const router = express.Router();
const notificationSettings = require('../../services/notificationSettings');
const adversusAPI = require('../../services/adversusAPI');

// ==================== NOTIFICATION SETTINGS ====================

// Get notification settings
router.get('/', async (req, res) => {
  try {
    const settings = await notificationSettings.getSettings();

    // Get available groups from Adversus
    let availableGroups = [];
    try {
      const groupsResult = await adversusAPI.getGroups();
      availableGroups = groupsResult.groups || [];
      console.log(`✅ Loaded ${availableGroups.length} groups for notification settings`);
    } catch (error) {
      console.error('⚠️ Failed to load Adversus groups:', error.message);
    }

    res.json({
      success: true,
      settings,
      availableGroups
    });
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
