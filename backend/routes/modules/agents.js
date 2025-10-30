const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const database = require('../../services/database');
const multer = require('multer');
const { cloudinary, imageStorage } = require('../../config/cloudinary');

// Multer upload med Cloudinary (max 5MB)
const upload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ==================== AGENTS ====================

// Get all agents
router.get('/', async (req, res) => {
  try {
    const agents = await database.getAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create agent
router.post('/', async (req, res) => {
  try {
    const agent = await database.addAgent(req.body);
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update agent
router.put('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const agent = await database.updateAgent(userId, req.body);
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete agent
router.delete('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    await database.deleteAgent(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload profile image
router.post('/:userId/profile-image', upload.single('image'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const imageUrl = req.file.path;

    await database.updateAgent(userId, {
      profileImage: imageUrl
    });

    res.json({ imageUrl });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync groups from Adversus
router.post('/sync-groups', async (req, res) => {
  try {
    console.log('🔄 Starting group sync...');

    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];

    const groupsResult = await adversusAPI.getUserGroups();
    const adversusGroups = groupsResult.groups || [];

    console.log(`📥 Fetched ${adversusUsers.length} users and ${adversusGroups.length} groups`);

    const agents = await database.getAgents();
    let updatedCount = 0;
    let createdCount = 0;

    for (const user of adversusUsers) {
      const userId = user.id;
      const groupId = user.group?.id ? parseInt(user.group.id) : null;
      const groupName = user.group?.name || null;

      const existingAgent = agents.find(a => a.userId === userId);

      if (existingAgent) {
        if (existingAgent.groupId !== groupId || existingAgent.groupName !== groupName) {
          await database.updateAgent(userId, {
            groupId,
            groupName
          });
          updatedCount++;
        }
      } else {
        await database.addAgent({
          userId,
          name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim(),
          email: user.email || '',
          groupId,
          groupName
        });
        createdCount++;
      }
    }

    console.log(`✅ Sync complete: ${updatedCount} updated, ${createdCount} created`);

    res.json({
      success: true,
      message: `Groups synced: ${updatedCount} updated, ${createdCount} created`,
      stats: {
        totalUsers: adversusUsers.length,
        totalGroups: adversusGroups.length,
        updated: updatedCount,
        created: createdCount
      }
    });
  } catch (error) {
    console.error('❌ Group sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Adversus users
router.get('/adversus/users', async (req, res) => {
  try {
    const result = await adversusAPI.getUsers();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Adversus groups
router.get('/adversus/groups', async (req, res) => {
  try {
    const result = await adversusAPI.getUserGroups();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available groups with agent counts
// IMPORTANT: Only uses user.group.id (NOT membersOf/teams)
router.get('/available-groups', async (req, res) => {
  try {
    const usersResult = await adversusAPI.getUsers();
    const users = usersResult.users || [];

    console.log(`📊 Processing ${users.length} users for group extraction`);

    // Extract unique groups from user.group.id ONLY (not membersOf!)
    const groupsMap = new Map();

    users.forEach(user => {
      // Only use user.group.id, ignore membersOf completely
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

        // Increment agent count for this group
        const group = groupsMap.get(groupId);
        group.agentCount++;
      }
    });

    // Convert map to array and sort by name
    const groupsWithCounts = Array.from(groupsMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`✅ Found ${groupsWithCounts.length} unique groups from user.group.id`);
    console.log(`📋 Groups:`, groupsWithCounts.map(g => `${g.name} (${g.agentCount})`).join(', '));

    res.json({ groups: groupsWithCounts });
  } catch (error) {
    console.error('❌ Error fetching available groups:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
