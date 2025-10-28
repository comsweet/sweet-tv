const express = require('express');
const router = express.Router();
const adversusAPI = require('../services/adversusAPI');
const database = require('../services/database');
const leaderboardService = require('../services/leaderboards');
const slideshowService = require('../services/slideshows');
const dealsCache = require('../services/dealsCache');
const leaderboardCache = require('../services/leaderboardCache');
const soundSettings = require('../services/soundSettings');
const soundLibrary = require('../services/soundLibrary');
const { cloudinary, imageStorage, soundStorage } = require('../config/cloudinary');
const notificationSettings = require('../services/notificationSettings');
const multer = require('multer');
const path = require('path');

// Multer upload med Cloudinary (max 5MB, med filetype validation)
const upload = multer({ 
  storage: imageStorage,
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

// ==================== AUTHENTICATION ====================

// Admin login
router.post('/auth/admin-login', (req, res) => {
  try {
    const { password } = req.body;
    
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ 
        success: false,
        error: 'Admin password not configured on server' 
      });
    }
    
    if (password === process.env.ADMIN_PASSWORD) {
      console.log('✅ Admin login successful');
      res.json({ 
        success: true,
        message: 'Authentication successful' 
      });
    } else {
      console.log('❌ Admin login failed - invalid password');
      res.status(401).json({ 
        success: false,
        error: 'Invalid password' 
      });
    }
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==================== AGENTS ====================

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

// PROFILE IMAGE UPLOAD (Cloudinary!) - FIXED VERSION
router.post('/agents/:userId/profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = req.file.path;
    console.log(`📸 Uploaded image to Cloudinary: ${imageUrl}`);
    
    // Hämta befintlig agent
    let existingAgent = await database.getAgent(req.params.userId);
    
    // 🔥 FIX: Om agent inte finns, skapa den FÖRST!
    if (!existingAgent) {
      console.log(`⚠️  Agent ${req.params.userId} not in database - creating...`);
      
      // Hämta från Adversus
      const usersRes = await adversusAPI.getUsers();
      const adversusUser = usersRes.users?.find(u => String(u.id) === String(req.params.userId));
      
      if (adversusUser) {
        existingAgent = await database.addAgent({
          userId: req.params.userId,
          name: adversusUser.name || `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim(),
          email: adversusUser.email || '',
          profileImage: null // Kommer uppdateras nedan
        });
        console.log(`✅ Created agent ${req.params.userId} in database`);
      } else {
        return res.status(404).json({ error: 'User not found in Adversus' });
      }
    }
    
    const oldImageUrl = existingAgent?.profileImage;
    
    // Uppdatera agent med ny bild
    const agent = await database.updateAgent(req.params.userId, {
      profileImage: imageUrl
    });
    
    if (!agent) {
      return res.status(500).json({ error: 'Could not update agent with profile image' });
    }
    
    console.log(`✅ Updated agent ${req.params.userId} with profileImage`);
    
    // OPTIONAL: Radera gammal bild från Cloudinary
    if (oldImageUrl && oldImageUrl.includes('cloudinary')) {
      try {
        const urlParts = oldImageUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `sweet-tv-profiles/${filename.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId);
        console.log(`🗑️  Deleted old image from Cloudinary: ${publicId}`);
      } catch (deleteError) {
        console.error('⚠️  Could not delete old image:', deleteError.message);
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

// NY: Hämta BARA riktiga user groups (från user.group.id, EJ memberOf!)
router.get('/adversus/actual-user-groups', async (req, res) => {
  try {
    console.log('🔍 Fetching ACTUAL user groups (not memberOf)...');
    const groups = await notificationSettings.getAvailableGroups(adversusAPI);
    console.log(`   ✅ Found ${groups.length} actual groups`);
    res.json({
      success: true,
      groups: groups,
      count: groups.length
    });
  } catch (error) {
    console.error('Error fetching actual user groups:', error);
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
    console.error('Error fetching stats:', error);
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

// 🔥 FIXED: LEADERBOARD DATA WITH PERSISTENT DEALS CACHE - VISA ALLA AGENTER INKL DE MED 0 DEALS!
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
    
    console.log(`📊 Cache miss - loading data: ${leaderboard.name}`);
    
    // AUTO-SYNC PERSISTENT DEALS CACHE (var 6:e timme)
    await dealsCache.autoSync(adversusAPI);
    
    // 🔥 HÄMTA BÅDE DEALS OCH SMS PARALLELLT
    const [cachedDeals, smsResponse] = await Promise.all([
      dealsCache.getDealsInRange(startDate, endDate),
      adversusAPI.getSMS(startDate, endDate)
    ]);
    
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
    
    // 📱 Räkna unika SMS per användare
    const uniqueSMSCount = adversusAPI.calculateUniqueSMS(smsResponse.sms || []);
    console.log(`📱 Calculated unique SMS for ${Object.keys(uniqueSMSCount).length} users`);
    
    // Hämta alla users EN gång
    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];
    
    const localAgents = await database.getAgents();
    
    let filteredUserIds = null;
    
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      console.log(`🔍 Filtering by user groups:`, leaderboard.userGroups);
      
      try {
        const targetGroupIds = leaderboard.userGroups.map(id => parseInt(id));
        filteredUserIds = new Set();
        
        // Hämta ALLA users från de valda grupperna
        for (const user of adversusUsers) {
          if (user.group?.id && targetGroupIds.includes(parseInt(user.group.id))) {
            filteredUserIds.add(String(user.id));
          }
        }
        
        console.log(`   📋 Found ${filteredUserIds.size} users in selected groups`);
      } catch (error) {
        console.error('⚠️  Error filtering user groups:', error.message);
        filteredUserIds = null;
      }
    }
    
    const stats = {};
    
    if (filteredUserIds) {
      // Om vi har filter, skapa entries för ALLA users i grupperna
      for (const userId of filteredUserIds) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0,
          uniqueSMS: uniqueSMSCount[userId] || 0, // 📱 Lägg till SMS
          smsSuccessRate: 0 // Beräknas senare
        };
      }
      console.log(`   📊 Initialized stats for ${Object.keys(stats).length} users in groups (including those with 0 deals)`);
    }
    
    // Räkna deals för varje user
    leads.forEach(lead => {
      const userId = lead.lastContactedBy;
      
      if (!userId) return;
      
      // Använd filtreringen (om den finns)
      if (filteredUserIds && !filteredUserIds.has(userId)) return;
      
      // Om ingen filter, skapa entry first time vi ser usern
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0,
          uniqueSMS: uniqueSMSCount[userId] || 0, // 📱 Lägg till SMS
          smsSuccessRate: 0
        };
      }
      
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commission = parseFloat(commissionField?.value || 0);
      
      stats[userId].totalCommission += commission;
      stats[userId].dealCount += 1;
    });
    
    // 📱 Beräkna SMS success rate för alla användare
    Object.keys(stats).forEach(userId => {
      const stat = stats[userId];
      if (stat.uniqueSMS > 0) {
        stat.smsSuccessRate = (stat.dealCount / stat.uniqueSMS) * 100;
      } else {
        stat.smsSuccessRate = 0;
      }
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
    console.log(`   📱 SMS stats included: ${Object.keys(uniqueSMSCount).length} users with SMS data`);
    
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

// Nytt endpoint för att invaldera cache när deal skapas
router.post('/leaderboards/cache/invalidate-all', async (req, res) => {
  try {
    leaderboardCache.clear();
    console.log('🗑️ Cache cleared due to new deal');
    res.json({ success: true });
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
    
    leaderboardCache.clear();
    
    res.json({ 
      success: true, 
      message: `Synced ${deals.length} deals and cleared cache`,
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

// 🔥 UPPDATERAD: RENSA BARA DEALS CACHE
router.delete('/deals/database', async (req, res) => {
  try {
    // Rensa bara deals cache
    await dealsCache.saveCache([]);
    console.log('✅ Cleared deals-cache.json');
    
    res.json({ 
      success: true, 
      message: 'Cleared deals cache (deals-cache.json)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SMS MANAGEMENT ====================

// Hämta SMS-statistik
router.get('/sms/stats', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Senaste 30 dagarna
    
    const smsResponse = await adversusAPI.getSMS(startDate, endDate);
    const uniqueSMSCount = adversusAPI.calculateUniqueSMS(smsResponse.sms || []);
    
    const stats = {
      totalSMS: smsResponse.sms.length,
      uniqueUsers: Object.keys(uniqueSMSCount).length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      lastFetch: new Date().toISOString()
    };
    
    console.log(`📱 SMS stats: ${stats.totalSMS} messages, ${stats.uniqueUsers} users`);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manuell SMS-synkning (rensar även cache)
router.post('/sms/sync', async (req, res) => {
  try {
    console.log('🔄 Manual SMS sync triggered from admin');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60); // 60 dagar för säkerhet
    
    const smsResponse = await adversusAPI.getSMS(startDate, endDate);
    const uniqueSMSCount = adversusAPI.calculateUniqueSMS(smsResponse.sms || []);
    
    // Rensa leaderboard cache så nya SMS-data hämtas nästa gång
    leaderboardCache.clear();
    
    console.log(`📱 Synced ${smsResponse.sms.length} SMS messages`);
    console.log(`   👥 ${Object.keys(uniqueSMSCount).length} users with SMS data`);
    
    res.json({ 
      success: true, 
      message: `Synced ${smsResponse.sms.length} SMS messages and cleared cache`,
      smsCount: smsResponse.sms.length,
      uniqueUsers: Object.keys(uniqueSMSCount).length,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error syncing SMS:', error);
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

// GET single sound
router.get('/sounds/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.getSound(req.params.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    res.json(sound);
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

// 🔥 UPPDATERAD: LINK agent to sound - Uppdaterar BÅDA filerna!
router.post('/sounds/:id/link-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    console.log(`🔗 Linking agent ${userId} to sound ${req.params.id}`);
    
    // STEG 1: Lägg till i soundLibrary.json
    const sound = await soundLibrary.linkAgent(req.params.id, userId);
    console.log(`✅ Added to sound linkedAgents`);
    
    // STEG 2: Uppdatera agents.json för att sätta customSound
    const agent = await database.getAgent(userId);
    if (agent) {
      // Om agenten redan har ett annat customSound, ta bort från det ljudet först
      if (agent.customSound && agent.customSound !== sound.url) {
        const sounds = await soundLibrary.getSounds();
        const oldSound = sounds.find(s => s.url === agent.customSound);
        if (oldSound) {
          await soundLibrary.unlinkAgent(oldSound.id, userId);
          console.log(`✅ Removed agent from old sound`);
        }
      }
      
      await database.updateAgent(userId, {
        customSound: sound.url,
        preferCustomSound: true
      });
      console.log(`✅ Set customSound for agent ${agent.name || userId}`);
    }
    
    res.json(sound);
  } catch (error) {
    console.error('❌ Error linking agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 UPPDATERAD: UNLINK agent from sound - Uppdaterar BÅDA filerna!
router.post('/sounds/:id/unlink-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    console.log(`🔗 Unlinking agent ${userId} from sound ${req.params.id}`);
    
    // STEG 1: Ta bort från soundLibrary.json
    const sound = await soundLibrary.unlinkAgent(req.params.id, userId);
    console.log(`✅ Removed from sound linkedAgents`);
    
    // STEG 2: Uppdatera agents.json för att ta bort customSound
    // Men BARA om agenten faktiskt hade detta ljud som customSound
    const agent = await database.getAgent(userId);
    if (agent && agent.customSound === sound.url) {
      await database.updateAgent(userId, {
        customSound: null,
        preferCustomSound: false
      });
      console.log(`✅ Removed customSound from agent ${agent.name || userId}`);
    }
    
    res.json(sound);
  } catch (error) {
    console.error('❌ Error unlinking agent:', error);
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

// GET sound for specific agent
router.get('/sounds/agent/:userId', async (req, res) => {
  try {
    const sound = await soundLibrary.getSoundForAgent(req.params.userId);
    res.json(sound || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🧪 TEST ROUTE
router.post('/sounds/test-simple', (req, res) => {
  console.log('🧪 TEST ROUTE HIT!');
  res.json({ success: true, message: 'Test works!' });
});

// 🧹 CLEANUP ORPHANED SOUND REFERENCES (gammal version - rensar bara agents.json)
router.post('/sounds/cleanup', async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of orphaned sound references...');
    
    // Hämta alla ljud och agenter
    const sounds = await soundLibrary.getSounds();
    const agents = await database.getAgents();
    
    console.log(`📊 Found ${sounds.length} sounds and ${agents.length} agents`);
    
    let cleanedCount = 0;
    let checkedCount = 0;
    
    // För varje agent, kolla om de har ljudkopplingar
    for (const agent of agents) {
      try {
        // Skip if agent has no userId
        if (!agent.userId) {
          console.log(`⚠️  Skipping agent without userId`);
          continue;
        }
        
        const userIdNum = typeof agent.userId === 'string' ? parseInt(agent.userId, 10) : agent.userId;
        checkedCount++;
        
        // Kolla om agenten finns i något ljuds linkedAgents array
        const hasActiveSoundLink = sounds.some(sound => {
          // Safety check: ensure linkedAgents exists and is an array
          if (!sound.linkedAgents || !Array.isArray(sound.linkedAgents)) {
            return false;
          }
          
          return sound.linkedAgents.some(linkedId => {
            const normalizedLinkedId = typeof linkedId === 'string' ? parseInt(linkedId, 10) : linkedId;
            return normalizedLinkedId === userIdNum;
          });
        });
        
        // Om agenten INTE finns i något ljuds linkedAgents men har customSound/preferCustomSound
        if (!hasActiveSoundLink && (agent.customSound || agent.preferCustomSound)) {
          console.log(`🧹 Cleaning orphaned sound reference for agent ${agent.name || userIdNum} (${userIdNum})`);
          
          await database.updateAgent(userIdNum, {
            customSound: null,
            preferCustomSound: false
          });
          
          cleanedCount++;
        }
      } catch (agentError) {
        console.error(`❌ Error processing agent ${agent.userId}:`, agentError.message);
        // Continue with next agent
        continue;
      }
    }
    
    console.log(`✅ Cleanup complete! Checked ${checkedCount} agents, cleaned ${cleanedCount} orphaned references`);
    
    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} orphaned sound references`,
      cleanedCount: cleanedCount,
      checkedCount: checkedCount
    });
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.stack 
    });
  }
});

// 🔥 NYA: FORCE CLEANUP - Synkroniserar soundLibrary.json och agents.json
router.post('/sounds/force-cleanup', async (req, res) => {
  try {
    console.log('🧹 Starting FORCE CLEANUP of sound references...');
    
    // Hämta alla ljud och agenter
    const sounds = await soundLibrary.getSounds();
    const agents = await database.getAgents();
    
    console.log(`📊 Found ${sounds.length} sounds and ${agents.length} agents`);
    
    let soundsCleaned = 0;
    let agentsCleaned = 0;
    let totalRemovedLinks = 0;
    
    // ========== STEG 1: Rensa soundLibrary.json ==========
    // För varje ljud, kolla om linkedAgents faktiskt har customSound
    for (const sound of sounds) {
      if (!sound.linkedAgents || sound.linkedAgents.length === 0) {
        continue;
      }
      
      const validLinks = [];
      const removedLinks = [];
      
      for (const userId of sound.linkedAgents) {
        const agent = agents.find(a => String(a.userId) === String(userId));
        
        // Kolla om agenten finns OCH har detta ljud som customSound
        const hasValidLink = agent && 
                           agent.customSound === sound.url && 
                           agent.preferCustomSound === true;
        
        if (hasValidLink) {
          validLinks.push(userId);
        } else {
          removedLinks.push(userId);
          totalRemovedLinks++;
          
          const agentName = agent?.name || `Agent ${userId}`;
          console.log(`🧹 Removing ${agentName} (${userId}) from sound "${sound.name}"`);
        }
      }
      
      // Uppdatera ljudet om vi tagit bort länkar
      if (removedLinks.length > 0) {
        await soundLibrary.updateSound(sound.id, {
          linkedAgents: validLinks
        });
        soundsCleaned++;
        
        console.log(`✅ Cleaned sound "${sound.name}": removed ${removedLinks.length} invalid links`);
      }
    }
    
    // ========== STEG 2: Rensa agents.json ==========
    // För varje agent med customSound, kolla att ljudet faktiskt finns
    for (const agent of agents) {
      if (!agent.customSound || !agent.preferCustomSound) {
        continue;
      }
      
      // Kolla om det finns ett ljud med denna URL
      const sound = sounds.find(s => s.url === agent.customSound);
      
      if (!sound) {
        // Ljudet finns inte alls - rensa agent
        console.log(`🧹 Removing orphaned customSound from agent ${agent.name || agent.userId}`);
        
        await database.updateAgent(agent.userId, {
          customSound: null,
          preferCustomSound: false
        });
        
        agentsCleaned++;
        continue;
      }
      
      // Kolla om agenten finns i ljudets linkedAgents
      const isLinked = sound.linkedAgents && 
                      sound.linkedAgents.some(id => String(id) === String(agent.userId));
      
      if (!isLinked) {
        // Agenten har customSound men finns inte i ljudets linkedAgents
        console.log(`🧹 Removing unlinked customSound from agent ${agent.name || agent.userId}`);
        
        await database.updateAgent(agent.userId, {
          customSound: null,
          preferCustomSound: false
        });
        
        agentsCleaned++;
      }
    }
    
    console.log(`✅ FORCE CLEANUP COMPLETE!`);
    console.log(`   - Cleaned ${soundsCleaned} sounds`);
    console.log(`   - Removed ${totalRemovedLinks} invalid links from sounds`);
    console.log(`   - Cleaned ${agentsCleaned} agents`);
    
    res.json({
      success: true,
      message: `Cleanup complete!`,
      soundsCleaned,
      agentsCleaned,
      totalRemovedLinks,
      details: {
        soundsChecked: sounds.length,
        agentsChecked: agents.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error during force cleanup:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.stack 
    });
  }
});

// ==================== NOTIFICATION SETTINGS ====================

// Get notification settings
router.get('/notification-settings', async (req, res) => {
  try {
    const settings = await notificationSettings.getSettings();
    const availableGroups = await notificationSettings.getAvailableGroups(adversusAPI); // ✅ ÄNDRAT!
    
    res.json({
      success: true,
      settings,
      availableGroups
    });
  } catch (error) {
    console.error('Error getting notification settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update notification settings
router.post('/notification-settings', async (req, res) => {
  try {
    const { mode, enabledGroups, disabledGroups } = req.body;
    
    const updatedSettings = await notificationSettings.updateSettings({
      mode,
      enabledGroups,
      disabledGroups
    });
    
    res.json({
      success: true,
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Block/unblock specific group
router.post('/notification-settings/toggle-group', async (req, res) => {
  try {
    const { groupId, block } = req.body;
    
    const settings = block 
      ? await notificationSettings.blockGroup(groupId)
      : await notificationSettings.unblockGroup(groupId);
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error toggling group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set mode (whitelist/blacklist)
router.post('/notification-settings/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    
    const settings = await notificationSettings.setMode(mode);
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error setting mode:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 NY: SYNKA GROUPS FRÅN ADVERSUS
// Lägg till detta i backend/routes/api.js efter andra agent-endpoints

router.post('/agents/sync-groups', async (req, res) => {
  try {
    console.log('🔄 Syncing groups from Adversus...');
    
    // Hämta alla users från Adversus
    const usersResult = await adversusAPI.getUsers();
    const adversusUsers = usersResult.users || [];
    
    console.log(`📋 Got ${adversusUsers.length} users from Adversus`);
    
    // Hämta alla lokala agents
    const localAgents = await database.getAgents();
    
    let updatedCount = 0;
    let skippedCount = 0;
    let createdCount = 0;
    
    // Uppdatera varje agent med groupId och groupName
    for (const adversusUser of adversusUsers) {
      const userId = adversusUser.id;
      const groupId = adversusUser.group?.id ? parseInt(adversusUser.group.id) : null;
      const groupName = adversusUser.group?.name || null;
      
      // Hitta lokal agent
      const localAgent = localAgents.find(a => String(a.userId) === String(userId));
      
      if (localAgent) {
        // Uppdatera befintlig agent
        if (localAgent.groupId !== groupId || localAgent.groupName !== groupName) {
          await database.updateAgent(userId, {
            groupId: groupId,
            groupName: groupName
          });
          updatedCount++;
          console.log(`✅ Updated ${adversusUser.name}: group ${groupId} (${groupName})`);
        } else {
          skippedCount++;
        }
      } else {
        // Skapa ny agent
        await database.addAgent({
          userId: userId,
          name: adversusUser.name || 
                `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                `User ${userId}`,
          email: adversusUser.email || '',
          groupId: groupId,
          groupName: groupName
        });
        createdCount++;
        console.log(`➕ Created ${adversusUser.name}: group ${groupId} (${groupName})`);
      }
    }
    
    console.log(`✅ Sync complete!`);
    console.log(`   - Updated: ${updatedCount}`);
    console.log(`   - Created: ${createdCount}`);
    console.log(`   - Skipped (no change): ${skippedCount}`);
    
    res.json({
      success: true,
      message: `Synced groups for ${adversusUsers.length} users`,
      updated: updatedCount,
      created: createdCount,
      skipped: skippedCount,
      total: adversusUsers.length
    });
    
  } catch (error) {
    console.error('❌ Error syncing groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NYA LEADERBOARD ENDPOINTS
// ============================================

// 1. DEALS SYNC
router.post('/deals/sync', async (req, res) => {
  try {
    console.log('🔄 Startar synkning av deals från Adversus...');
    
    const filters = {
      status: { $eq: "success" }
    };

    let allDeals = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.adversus.io/v1/leads?page=${page}&pageSize=100&filters=${encodeURIComponent(JSON.stringify(filters))}`;
      
      console.log(`📄 Hämtar deals sida ${page}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${process.env.ADVERSUS_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      const deals = (data.content || []).map(lead => {
        const commissionField = lead.resultData?.find(f => f.id === 70163);
        const commission = parseFloat(commissionField?.value || 0);
        
        return {
          id: lead.id,
          userId: lead.userId,
          leadId: lead.leadId,
          status: lead.status,
          commission: commission,
          resultData: lead.resultData,
          createdDateTime: lead.createdDateTime,
          lastModifiedDateTime: lead.lastModifiedDateTime,
          timestamp: lead.lastModifiedDateTime || lead.createdDateTime
        };
      });

      allDeals = allDeals.concat(deals);
      hasMore = data.content && data.content.length === 100;
      page++;
    }

    global.dealsCache = allDeals;
    const totalCommission = allDeals.reduce((sum, d) => sum + d.commission, 0);
    
    console.log(`✅ Synkade ${allDeals.length} deals från Adversus`);
    console.log(`💰 Total commission: ${totalCommission.toFixed(2)} THB`);
    
    res.json({ 
      success: true, 
      count: allDeals.length,
      totalCommission: totalCommission,
      message: `Synkade ${allDeals.length} deals med total commission ${totalCommission.toFixed(2)} THB`
    });

  } catch (error) {
    console.error('❌ Deals sync failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// 2. SMS SYNC
router.post('/sms/sync', async (req, res) => {
  try {
    console.log('📱 Startar synkning av SMS från Adversus...');
    
    const monthStart = new Date();
    monthStart.setDate(1);
    
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    
    const now = new Date();

    console.log(`📅 Datumintervall: ${startDate.toISOString()} → ${now.toISOString()}`);

    const filters = {
      type: { $eq: "outbound" },
      timestamp: {
        $gte: startDate.toISOString(),
        $lte: now.toISOString()
      }
    };

    let allSms = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.adversus.io/v1/sms?page=${page}&pageSize=100&includeMeta=true&filters=${encodeURIComponent(JSON.stringify(filters))}`;
      
      console.log(`📄 Hämtar SMS sida ${page}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${process.env.ADVERSUS_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      allSms = allSms.concat(data.content || []);
      hasMore = data.content && data.content.length === 100;
      page++;
    }

    global.smsCache = allSms;
    
    console.log(`✅ Synkade ${allSms.length} SMS från Adversus`);
    
    res.json({ 
      success: true, 
      count: allSms.length,
      dateRange: {
        from: startDate.toISOString(),
        to: now.toISOString()
      },
      message: `Synkade ${allSms.length} SMS från ${startDate.toLocaleDateString('sv-SE')} till nu`
    });

  } catch (error) {
    console.error('❌ SMS sync failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// 3. LEADERBOARD
router.get('/leaderboards/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    console.log(`📊 Genererar ${type} leaderboard...`);
    
    if (!global.dealsCache || !global.smsCache) {
      return res.status(400).json({
        success: false,
        error: 'Cache är tom. Kör /api/deals/sync och /api/sms/sync först!'
      });
    }
    
    let filteredDeals = [];
    let dealStartDate;
    
    if (type === 'today') {
      dealStartDate = new Date();
      dealStartDate.setHours(0, 0, 0, 0);
      
      filteredDeals = global.dealsCache.filter(deal => {
        const dealDate = new Date(deal.lastModifiedDateTime || deal.createdDateTime);
        return dealDate >= dealStartDate;
      });
      
    } else if (type === 'month') {
      dealStartDate = new Date();
      dealStartDate.setDate(1);
      dealStartDate.setHours(0, 0, 0, 0);
      
      filteredDeals = global.dealsCache.filter(deal => {
        const dealDate = new Date(deal.lastModifiedDateTime || deal.createdDateTime);
        return dealDate >= dealStartDate;
      });
    }

    let filteredSms = [];
    
    if (type === 'today') {
      const smsStartDate = new Date();
      smsStartDate.setHours(0, 0, 0, 0);
      
      filteredSms = global.smsCache.filter(sms => {
        const smsDate = new Date(sms.timestamp);
        return smsDate >= smsStartDate;
      });
      
    } else if (type === 'month') {
      const smsStartDate = new Date();
      smsStartDate.setDate(1);
      smsStartDate.setHours(0, 0, 0, 0);
      
      filteredSms = global.smsCache.filter(sms => {
        const smsDate = new Date(sms.timestamp);
        return smsDate >= smsStartDate;
      });
    }

    const stats = {};
    
    filteredDeals.forEach(deal => {
      const userId = deal.userId;
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          deals: 0,
          totalCommission: 0,
          smsSent: 0,
          uniqueSms: new Set()
        };
      }
      stats[userId].deals++;
      stats[userId].totalCommission += deal.commission || 0;
    });

    filteredSms.forEach(sms => {
      const userId = sms.userId;
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          deals: 0,
          totalCommission: 0,
          smsSent: 0,
          uniqueSms: new Set()
        };
      }
      stats[userId].smsSent++;
      
      if (sms.receiver) {
        stats[userId].uniqueSms.add(sms.receiver);
      }
    });

    const leaderboard = Object.values(stats).map(stat => {
      const uniqueSmsCount = stat.uniqueSms.size;
      const successRate = uniqueSmsCount > 0 ? (stat.deals / uniqueSmsCount) * 100 : 0;
      
      return {
        userId: stat.userId,
        deals: stat.deals,
        commission: stat.totalCommission,
        smsSent: stat.smsSent,
        uniqueSms: uniqueSmsCount,
        successRate: parseFloat(successRate.toFixed(2))
      };
    }).sort((a, b) => b.commission - a.commission);

    console.log(`✅ Genererade leaderboard med ${leaderboard.length} agents`);

    res.json({ 
      success: true, 
      type: type,
      leaderboard: leaderboard,
      stats: {
        totalDeals: filteredDeals.length,
        totalSms: filteredSms.length,
        totalCommission: leaderboard.reduce((sum, l) => sum + l.commission, 0)
      }
    });

  } catch (error) {
    console.error('❌ Leaderboard calculation failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// 4. CACHE INVALIDATE
router.post('/leaderboards/cache/invalidate-all', async (req, res) => {
  try {
    console.log('🗑️ Rensar all cache...');
    
    global.dealsCache = [];
    global.smsCache = [];
    
    console.log('✅ Cache rensad!');
    
    res.json({ 
      success: true,
      message: 'All cache har rensats'
    });
    
  } catch (error) {
    console.error('❌ Cache invalidation failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// 5. STATS ENDPOINTS
router.get('/deals/stats', (req, res) => {
  const deals = global.dealsCache || [];
  const totalCommission = deals.reduce((sum, d) => sum + d.commission, 0);
  
  res.json({
    success: true,
    count: deals.length,
    totalCommission: totalCommission,
    deals: deals.slice(0, 5)
  });
});

router.get('/sms/stats', (req, res) => {
  const sms = global.smsCache || [];
  const uniqueReceivers = new Set(sms.map(s => s.receiver)).size;
  
  res.json({
    success: true,
    count: sms.length,
    uniqueReceivers: uniqueReceivers,
    sms: sms.slice(0, 5)
  });
});

router.get('/leaderboards/cache/stats', (req, res) => {
  const deals = global.dealsCache || [];
  const sms = global.smsCache || [];
  
  res.json({
    success: true,
    dealsCount: deals.length,
    smsCount: sms.length,
    totalCommission: deals.reduce((sum, d) => sum + d.commission, 0)
  });
});

module.exports = router;
