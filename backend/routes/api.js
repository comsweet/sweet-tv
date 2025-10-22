const express = require('express');
const router = express.Router();
const adversusAPI = require('../services/adversusAPI');
const database = require('../services/database');
const multer = require('multer');
const path = require('path');

// Profilbilds-uppladdning
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../data/profile-images'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'agent-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files allowed!'));
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AGENTS
router.get('/agents', async (req, res) => {
  try {
    const agents = await database.getAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents', async (req, res) => {
  try {
    const agent = await database.addAgent(req.body);
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/agents/:userId', async (req, res) => {
  try {
    const agent = await database.updateAgent(req.params.userId, req.body);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/agents/:userId', async (req, res) => {
  try {
    await database.deleteAgent(req.params.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:userId/profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `/profile-images/${req.file.filename}`;
    const agent = await database.updateAgent(req.params.userId, {
      profileImage: imageUrl
    });
    
    res.json({ imageUrl, agent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADVERSUS
router.get('/adversus/users', async (req, res) => {
  try {
    const users = await adversusAPI.getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/adversus/user-groups', async (req, res) => {
  try {
    const userGroups = await adversusAPI.getUserGroups();
    res.json(userGroups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// STATS - Hämta direkt från Adversus API
router.get('/stats/leaderboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    console.log(`📊 Fetching stats from ${start.toISOString()} to ${end.toISOString()}`);
    
    // Hämta success leads från Adversus
    const result = await adversusAPI.getLeadsInDateRange(start, end);
    const leads = result.leads || [];
    
    console.log(`✅ Found ${leads.length} success leads`);
    
    // Hämta lokala agenter (för namn och bilder)
    const agents = await database.getAgents();
    
    // Gruppera per agent och räkna commission
    const stats = {};
    
    leads.forEach(lead => {
      const userId = lead.lastContactedBy;
      
      if (!userId) return; // Skip om ingen agent
      
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0
        };
      }
      
      // Hitta commission från resultData (field ID 70163)
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commission = parseFloat(commissionField?.value || 0);
      
      stats[userId].totalCommission += commission;
      stats[userId].dealCount += 1;
    });
    
    // Konvertera till array och lägg till agent-info
    const leaderboard = Object.values(stats).map(stat => {
      const agent = agents.find(a => String(a.userId) === String(stat.userId));
      return {
        ...stat,
        agent: agent || { 
          userId: stat.userId, 
          name: `Agent ${stat.userId}`,
          profileImage: null
        }
      };
    }).sort((a, b) => b.totalCommission - a.totalCommission);
    
    console.log(`📈 Leaderboard with ${leaderboard.length} agents`);
    
    res.json(leaderboard);
  } catch (error) {
    console.error('❌ Error fetching leaderboard:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Manual poll trigger
router.post('/poll/trigger', async (req, res) => {
  try {
    const pollingService = req.app.get('pollingService');
    if (pollingService) {
      await pollingService.checkNow();
      res.json({ success: true, message: 'Manual poll triggered' });
    } else {
      res.status(500).json({ error: 'Polling service not available' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
