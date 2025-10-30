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
router.get('/available-groups', async (req, res) => {
  try {
    const result = await adversusAPI.getUserGroups();
    const groupsResult = result.groups || [];
    const usersResult = await adversusAPI.getUsers();
    const users = usersResult.users || [];

    const groupsWithCounts = groupsResult.map(group => {
      const agentCount = users.filter(u => u.group && String(u.group.id) === String(group.id)).length;
      return {
        id: group.id,
        name: group.name,
        agentCount
      };
    });

    res.json({ groups: groupsWithCounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
