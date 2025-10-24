const express = require('express');
const router = express.Router();
const adversusAPI = require('../services/adversusAPI');
const database = require('../services/database');
const leaderboardService = require('../services/leaderboards');
const slideshowService = require('../services/slideshows'); // ← NY!
const leaderboardCache = require('../services/leaderboardCache');
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

// STATS
router.get('/stats/leaderboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    console.log(`📊 Fetching stats from ${start.toISOString()} to ${end.toISOString()}`);
    
    const result = await adversusAPI.getLeadsInDateRange(start, end);
    const leads = result.leads || [];
    
    console.log(`✅ Found ${leads.length} success leads`);
    
    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];
    console.log(`👥 Found ${adversusUsers.length} users from Adversus`);
    
    const localAgents = await database.getAgents();
    
    const stats = {};
    
    leads.forEach(lead => {
      const userId = lead.lastContactedBy;
      
      if (!userId) return;
      
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0
        };
      }
      
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commission = parseFloat(commissionField?.value || 0);
      
      stats[userId].totalCommission += commission;
      stats[userId].dealCount += 1;
    });
    
    const leaderboard = Object.values(stats).map(stat => {
      const adversusUser = adversusUsers.find(u => String(u.id) === String(stat.userId));
      const localAgent = localAgents.find(a => String(a.userId) === String(stat.userId));
      
      let agentName = `Agent ${stat.userId}`;
      if (adversusUser) {
        agentName = adversusUser.name || 
                   `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                   `Agent ${stat.userId}`;
      }
      
      return {
        ...stat,
        agent: {
          userId: stat.userId,
          name: agentName,
          email: adversusUser?.email || '',
          profileImage: localAgent?.profileImage || null
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

// LEADERBOARDS CRUD
router.get('/leaderboards', async (req, res) => {
  try {
    const leaderboards = await leaderboardService.getLeaderboards();
    res.json(leaderboards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leaderboards/active', async (req, res) => {
  try {
    const activeLeaderboards = await leaderboardService.getActiveLeaderboards();
    res.json(activeLeaderboards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leaderboards/:id', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.getLeaderboard(req.params.id);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/leaderboards', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.addLeaderboard(req.body);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/leaderboards/:id', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.updateLeaderboard(req.params.id, req.body);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/leaderboards/:id', async (req, res) => {
  try {
    await leaderboardService.deleteLeaderboard(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SLIDESHOWS CRUD (NY!)
router.get('/slideshows', async (req, res) => {
  try {
    const slideshows = await slideshowService.getSlideshows();
    res.json(slideshows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slideshows/active', async (req, res) => {
  try {
    const activeSlideshows = await slideshowService.getActiveSlideshows();
    res.json(activeSlideshows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slideshows/:id', async (req, res) => {
  try {
    const slideshow = await slideshowService.getSlideshow(req.params.id);
    if (!slideshow) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    res.json(slideshow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/slideshows', async (req, res) => {
  try {
    const slideshow = await slideshowService.addSlideshow(req.body);
    res.json(slideshow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/slideshows/:id', async (req, res) => {
  try {
    const slideshow = await slideshowService.updateSlideshow(req.params.id, req.body);
    if (!slideshow) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    res.json(slideshow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/slideshows/:id', async (req, res) => {
  try {
    await slideshowService.deleteSlideshow(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LEADERBOARD DATA WITH SMART CACHING
router.get('/leaderboards/:id/stats', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.getLeaderboard(req.params.id);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    const { startDate, endDate } = leaderboardService.getDateRange(leaderboard);
    
    // TRY CACHE FIRST
    const cached = leaderboardCache.get(
      req.params.id,
      startDate.toISOString(),
      endDate.toISOString()
    );
    
    if (cached) {
      console.log(`✅ Serving from cache: ${leaderboard.name}`);
      return res.json(cached);
    }
    
    // CACHE MISS - Fetch from Adversus
    console.log(`📊 Cache miss - fetching from API: ${leaderboard.name}`);
    
    const result = await adversusAPI.getLeadsInDateRange(startDate, endDate);
    const leads = result.leads || [];
    
    console.log(`✅ Found ${leads.length} success leads`);
    
    // Hämta alla users för namn/email
    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];
    
    // SMART FILTRERING: Hämta bara group-info för relevanta users
    let filteredUserIds = null;
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      console.log(`🔍 Filtering by user groups:`, leaderboard.userGroups);
      
      try {
        const uniqueUserIds = [...new Set(leads.map(lead => lead.lastContactedBy).filter(id => id))];
        console.log(`   Found ${uniqueUserIds.length} unique users in leads`);
        
        const targetGroupIds = leaderboard.userGroups.map(id => parseInt(id));
        filteredUserIds = new Set();
        
        for (const userId of uniqueUserIds) {
          try {
            const userDetailResponse = await adversusAPI.request(`/users/${userId}`);
            const userDetail = userDetailResponse.users?.[0];
            
            if (userDetail && userDetail.memberOf) {
              const userGroupIds = userDetail.memberOf.map(membership => parseInt(membership.id));
              const hasMatchingGroup = targetGroupIds.some(targetId => 
                userGroupIds.includes(targetId)
              );
              
              if (hasMatchingGroup) {
                filteredUserIds.add(userId);
              }
            }
            
            // CRITICAL: Delay between user requests
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`   ⚠️ Could not fetch details for user ${userId}:`, error.message);
          }
        }
        
        console.log(`👥 Filtered to ${filteredUserIds.size} users from ${leaderboard.userGroups.length} groups`);
        
        if (filteredUserIds.size === 0) {
          console.log(`⚠️  WARNING: No users matched - showing ALL users instead`);
          filteredUserIds = null;
        }
      } catch (error) {
        console.error(`❌ Error filtering user groups:`, error.message);
        filteredUserIds = null;
      }
    } else {
      console.log(`👥 No groups filter - showing ALL users`);
    }
    
    const localAgents = await database.getAgents();
    
    const stats = {};
    
    leads.forEach(lead => {
      const userId = lead.lastContactedBy;
      
      if (!userId) return;
      
      // Filtrera på user groups om specificerat
      if (filteredUserIds && !filteredUserIds.has(userId)) return;
      
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0
        };
      }
      
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commission = parseFloat(commissionField?.value || 0);
      
      stats[userId].totalCommission += commission;
      stats[userId].dealCount += 1;
    });
    
    const leaderboardStats = Object.values(stats).map(stat => {
      const adversusUser = adversusUsers.find(u => String(u.id) === String(stat.userId));
      const localAgent = localAgents.find(a => String(a.userId) === String(stat.userId));
      
      let agentName = `Agent ${stat.userId}`;
      if (adversusUser) {
        agentName = adversusUser.name || 
                   `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                   `Agent ${stat.userId}`;
      }
      
      return {
        ...stat,
        agent: {
          userId: stat.userId,
          name: agentName,
          email: adversusUser?.email || '',
          profileImage: localAgent?.profileImage || null
        }
      };
    }).sort((a, b) => b.totalCommission - a.totalCommission);
    
    const responseData = {
      leaderboard: leaderboard,
      stats: leaderboardStats,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    };
    
    // CACHE THE RESULT
    leaderboardCache.set(
      req.params.id,
      startDate.toISOString(),
      endDate.toISOString(),
      responseData
    );
    
    console.log(`📈 Leaderboard "${leaderboard.name}" with ${leaderboardStats.length} agents (CACHED)`);
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Error fetching leaderboard stats:', error.message);
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

// CACHE ENDPOINTS
router.post('/leaderboards/cache/invalidate', async (req, res) => {
  try {
    const { leaderboardId } = req.body;
    
    if (leaderboardId) {
      leaderboardCache.invalidate(leaderboardId);
      res.json({ success: true, message: `Invalidated cache for ${leaderboardId}` });
    } else {
      leaderboardCache.clear();
      res.json({ success: true, message: 'Cleared all cache' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leaderboards/cache/stats', async (req, res) => {
  try {
    const stats = leaderboardCache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
