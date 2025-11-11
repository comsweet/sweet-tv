const express = require('express');
const router = express.Router();
const notificationSettings = require('../../services/notificationSettings');
const adversusAPI = require('../../services/adversusAPI');

// ==================== NOTIFICATION SETTINGS ====================

// Get notification settings
router.get('/', async (req, res) => {
  try {
    const settings = await notificationSettings.getSettings();

    // Get available groups from user.group.id ONLY (not membersOf!)
    let availableGroups = [];
    try {
      const usersResult = await adversusAPI.getUsers();
      const users = usersResult.users || [];

      console.log(`📊 Processing ${users.length} users for notification groups`);

      // Extract unique groups from user.group.id ONLY
      const groupsMap = new Map();

      users.forEach(user => {
        if (user.group && user.group.id) {
          const groupId = String(user.group.id);
          const groupName = user.group.name || `Group ${groupId}`;

          if (!groupsMap.has(groupId)) {
            groupsMap.set(groupId, {
              id: groupId,
              name: groupName,
              agentCount: 0
            });
          }

          // 🔥 FIX: Increment agent count for this group
          groupsMap.get(groupId).agentCount++;
        }
      });

      availableGroups = Array.from(groupsMap.values())
        .sort((a, b) => b.agentCount - a.agentCount); // Sort by agent count (descending)

      console.log(`✅ Found ${availableGroups.length} unique groups for notification settings`);
    } catch (error) {
      console.error('⚠️ Failed to load groups:', error.message);
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
