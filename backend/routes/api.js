const express = require('express');
const router = express.Router();
const adversusAPI = require('../services/adversusAPI');
const database = require('../services/database');
const leaderboardService = require('../services/leaderboards');
const slideshowService = require('../services/slideshows');
const dealsCache = require('../services/dealsCache');
const leaderboardCache = require('../services/leaderboardCache');
const { cloudinary, imageStorage, soundStorage } = require('../config/cloudinary');
const soundSettings = require('../services/soundSettings');
const soundLibrary = require('../services/soundLibrary');
const multer = require('multer');
const path = require('path');

// Multer upload med Cloudinary (max 5MB, med filetype validation)
const upload = multer({ storage: imageStorage, // FIXED: Now correctly using the storage from cloudinary config
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP allowed.'));
    }
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

// PROFILE IMAGE UPLOAD (Cloudinary!)
router.post('/agents/:userId/profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Cloudinary returnerar URL i req.file.path
    const imageUrl = req.file.path;
    console.log(`📸 Uploaded image to Cloudinary: ${imageUrl}`);
    
    // Hämta befintlig agent för att få gamla bilden
    const existingAgent = await database.getAgent(req.params.userId);
    const oldImageUrl = existingAgent?.profileImage;
    
    // Uppdatera agent med ny bild
    const agent = await database.updateAgent(req.params.userId, {
      profileImage: imageUrl
    });
    
    // OPTIONAL: Radera gammal bild från Cloudinary (om vi vill spara storage)
    if (oldImageUrl && oldImageUrl.includes('cloudinary')) {
      try {
        // Extrahera public_id från URL
        const urlParts = oldImageUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `sweet-tv-profiles/${filename.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId);
        console.log(`🗑️  Deleted old image from Cloudinary: ${publicId}`);
      } catch (deleteError) {
        console.error('⚠️  Could not delete old image:', deleteError.message);
        // Continue anyway - not critical
      }
    }
    
    res.json({ imageUrl, agent });
  } catch (error) {
    console.error('Error uploading image:', error);
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

// STATS (MED PERSISTENT CACHE!)
router.get('/stats/leaderboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    console.log(`📊 Fetching stats from ${start.toISOString()} to ${end.toISOString()}`);
    
    // AUTO-SYNC DEALS CACHE (syncar var 6:e timme)
    await dealsCache.autoSync(adversusAPI);
    
    // HÄMTA FRÅN CACHE ISTÄLLET FÖR ADVERSUS!
    const cachedDeals = await dealsCache.getDealsInRange(start, end);
    
    // Konvertera till leads-format för kompatibilitet
    const leads = cachedDeals.map(deal => ({
      id: deal.leadId,
      lastContactedBy: deal.userId,
      campaignId: deal.campaignId,
      status: deal.status,
      lastUpdatedTime: deal.orderDate,
      resultData: [
        { id: 70163, value: String(deal.commission) },
        { label: 'MultiDeals', value: deal.multiDeals },
        { label: 'Order date', value: deal.orderDate }
      ]
    }));
    
    console.log(`✅ Loaded ${leads.length} deals from cache`);
    
    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];
    
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

// SLIDESHOWS CRUD
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

// LEADERBOARD DATA WITH PERSISTENT DEALS CACHE
router.get('/leaderboards/:id/stats', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.getLeaderboard(req.params.id);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    const { startDate, endDate } = leaderboardService.getDateRange(leaderboard);
    
    // TRY IN-MEMORY CACHE FIRST (5 min TTL)
    const cached = leaderboardCache.get(
      req.params.id,
      startDate.toISOString(),
      endDate.toISOString()
    );
    
    if (cached) {
      console.log(`✅ Serving from memory cache: ${leaderboard.name}`);
      return res.json(cached);
    }
    
    console.log(`📊 Cache miss - loading from persistent cache: ${leaderboard.name}`);
    
    // AUTO-SYNC PERSISTENT DEALS CACHE (var 6:e timme)
    await dealsCache.autoSync(adversusAPI);
    
    // HÄMTA FRÅN PERSISTENT CACHE
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);
    
    // Konvertera till leads-format
    const leads = cachedDeals.map(deal => ({
      id: deal.leadId,
      lastContactedBy: deal.userId,
      campaignId: deal.campaignId,
      status: deal.status,
      lastUpdatedTime: deal.orderDate,
      resultData: [
        { id: 70163, value: String(deal.commission) },
        { label: 'MultiDeals', value: deal.multiDeals },
        { label: 'Order date', value: deal.orderDate }
      ]
    }));
    
    console.log(`✅ Loaded ${leads.length} deals from persistent cache`);
    
    // Hämta alla users EN gång (istället för att göra separata requests!)
    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];
    
    let filteredUserIds = null;
    
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      console.log(`🔍 Filtering by user groups:`, leaderboard.userGroups);
      
      try {
        const uniqueUserIds = [...new Set(leads.map(lead => lead.lastContactedBy).filter(id => id))];
        const targetGroupIds = leaderboard.userGroups.map(id => parseInt(id));
        filteredUserIds = new Set();
        
        console.log(`   📋 Checking ${uniqueUserIds.length} unique users against ${targetGroupIds.length} target groups`);
        
        // Loop genom alla users som har deals
        for (const userId of uniqueUserIds) {
          // Hitta user i adversusUsers array (som vi redan har!)
          const adversusUser = adversusUsers.find(u => String(u.id) === String(userId));
          
          if (adversusUser && adversusUser.group && adversusUser.group.id) {
            // Använd group.id (singular!) istället för memberOf
            const userGroupId = parseInt(adversusUser.group.id);
            
            // Kolla om user's primary group matchar någon av target groups
            if (targetGroupIds.includes(userGroupId)) {
              filteredUserIds.add(userId);
              console.log(`   ✅ User ${userId} matched (group: ${userGroupId})`);
            } else {
              console.log(`   ❌ User ${userId} NOT matched (group: ${userGroupId})`);
            }
          } else {
            console.log(`   ⚠️  User ${userId} has no primary group`);
          }
        }
        
        console.log(`   📊 Filter result: ${filteredUserIds.size} users matched out of ${uniqueUserIds.length}`);
        
        // Om inga users matchar, behåll tom Set (visar inga users)
        if (filteredUserIds.size === 0) {
          console.log(`   ⚠️  No users matched the selected groups - leaderboard will be empty`);
        }
      } catch (error) {
        console.error(`❌ Error filtering user groups:`, error.message);
        // Om något går fel, behåll tom Set för säkerhet
        filteredUserIds = new Set();
        console.log(`   ⚠️  Filtering failed - returning empty leaderboard for safety`);
      }
    }
    
    const localAgents = await database.getAgents();
    
    const stats = {};
    
    leads.forEach(lead => {
      const userId = lead.lastContactedBy;
      
      if (!userId) return;
      
      // Använd filtreringen (om den finns)
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
    
    // CACHE IN MEMORY (5 min TTL)
    leaderboardCache.set(
      req.params.id,
      startDate.toISOString(),
      endDate.toISOString(),
      responseData
    );
    
    console.log(`📈 Leaderboard "${leaderboard.name}" with ${leaderboardStats.length} agents`);
    
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

// DEALS CACHE ENDPOINTS (PERSISTENT!)
router.post('/deals/sync', async (req, res) => {
  try {
    console.log('🔄 Manual deals sync triggered from admin');
    const deals = await dealsCache.forceSync(adversusAPI);
    res.json({ 
      success: true, 
      message: `Synced ${deals.length} deals`,
      deals: deals.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/deals/stats', async (req, res) => {
  try {
    const stats = await dealsCache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deals/clean', async (req, res) => {
  try {
    await dealsCache.cleanOldDeals();
    const stats = await dealsCache.getStats();
    res.json({ 
      success: true, 
      message: 'Cleaned old deals',
      stats 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SOUND MANAGEMENT ====================

// GET sound settings
router.get('/sounds/settings', async (req, res) => {
  try {
    const settings = await soundSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE sound settings
router.put('/sounds/settings', async (req, res) => {
  try {
    const settings = await soundSettings.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all sounds
router.get('/sounds', async (req, res) => {
  try {
    const sounds = await soundLibrary.getSounds();
    res.json(sounds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPLOAD new sound
const uploadSound = multer({ 
  storage: soundStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, and OGG allowed.'));
    }
  }
});

router.post('/sounds/upload', uploadSound.single('sound'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const soundUrl = req.file.path;
    const originalName = req.file.originalname;
    
    console.log(`🎵 Uploaded sound to Cloudinary: ${soundUrl}`);
    
    const sound = await soundLibrary.addSound({
      name: originalName,
      url: soundUrl,
      duration: null
    });
    
    res.json(sound);
  } catch (error) {
    console.error('Error uploading sound:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE sound
router.delete('/sounds/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.getSound(req.params.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    
    // Delete from Cloudinary
    if (sound.url && sound.url.includes('cloudinary')) {
      try {
        const urlParts = sound.url.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `sweet-tv-sounds/${filename.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        console.log(`🗑️  Deleted sound from Cloudinary: ${publicId}`);
      } catch (deleteError) {
        console.error('⚠️  Could not delete sound from Cloudinary:', deleteError.message);
      }
    }
    
    await soundLibrary.deleteSound(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LINK agent to sound
router.post('/sounds/:id/link-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const sound = await soundLibrary.linkAgent(req.params.id, userId);
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UNLINK agent from sound
router.post('/sounds/:id/unlink-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const sound = await soundLibrary.unlinkAgent(req.params.id, userId);
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE sound metadata
router.put('/sounds/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.updateSound(req.params.id, req.body);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
