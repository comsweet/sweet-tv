const express = require('express');
const router = express.Router();
const adversusAPI = require('../services/adversusAPI');
const database = require('../services/database');
const leaderboardService = require('../services/leaderboards');
const slideshowService = require('../services/slideshows');
const dealsCache = require('../services/dealsCache');
const smsCache = require('../services/smsCache');
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

router.get('/adversus/user-groups', async (req, res) => {
  try {
    const userGroups = await adversusAPI.getUserGroups();
    res.json(userGroups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

    // 📱 AUTO-SYNC SMS CACHE (var 6:e timme)
    await smsCache.autoSync(adversusAPI);
    
    // HÄMTA FRÅN CACHE ISTÄLLET FÖR ADVERSUS!
    const cachedDeals = await dealsCache.getDealsInRange(start, end);
    
    // 🔥 FIX: Använd ID 74126 istället för label
    const leads = cachedDeals.map(deal => ({
      id: deal.leadId,
      lastContactedBy: deal.userId,
      campaignId: deal.campaignId,
      status: deal.status,
      lastUpdatedTime: deal.orderDate,
      resultData: [
        { id: 70163, value: String(deal.commission) },
        { id: 74126, value: deal.multiDeals },  // 🔥 FIX: Använd ID istället för label!
        { label: 'Order date', value: deal.orderDate }
      ]
    }));
    
    console.log(`✅ Loaded ${leads.length} deals from cache`);
    
    // 🔥 FIX: Bättre error handling
    let adversusUsers = [];
    let localAgents = [];
    
    try {
      const usersResult = await adversusAPI.getUsers();
      adversusUsers = usersResult.users || [];
      console.log(`✅ Loaded ${adversusUsers.length} Adversus users`);
    } catch (error) {
      console.error('⚠️ Failed to load Adversus users:', error.message);
    }
    
    try {
      localAgents = await database.getAgents();
      console.log(`✅ Loaded ${localAgents.length} local agents`);
    } catch (error) {
      console.error('⚠️ Failed to load local agents:', error.message);
    }
    
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
      
      // 🔥 FIX: Nu hittar den rätt field!
      const multiDealsField = lead.resultData?.find(f => f.id === 74126);
      const multiDealsValue = parseInt(multiDealsField?.value || '1');
      
      // 🐛 DEBUG LOG (ta bort efter test)
      if (multiDealsValue > 1) {
        console.log(`  🎯 Lead ${lead.id}: multiDeals=${multiDealsValue}`);
      }
      
      stats[userId].totalCommission += commission;
      stats[userId].dealCount += multiDealsValue;  // 🔥 Nu räknas det rätt!
    });
    
    // 🔥 FIX: Bygg alltid komplett agent-objekt
    const leaderboard = Object.values(stats).map(stat => {
      const adversusUser = adversusUsers.find(u => String(u.id) === String(stat.userId));
      const localAgent = localAgents.find(a => String(a.userId) === String(stat.userId));
      
      let agentName = `Agent ${stat.userId}`;
      if (adversusUser) {
        if (adversusUser.name) {
          agentName = adversusUser.name;
        } else if (adversusUser.firstname || adversusUser.lastname) {
          agentName = `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim();
        }
      }
      
      // 🔥 VIKTIGT: Alltid returnera ett komplett objekt med agent!
      return {
        userId: stat.userId,
        totalCommission: stat.totalCommission,
        dealCount: stat.dealCount,
        agent: {
          userId: stat.userId,
          name: agentName,
          email: adversusUser?.email || '',
          profileImage: localAgent?.profileImage || null
        }
      };
    }).sort((a, b) => b.totalCommission - a.totalCommission);
    
    console.log(`📈 Leaderboard with ${leaderboard.length} agents`);
    
    // 🔥 DEBUG: Kolla första objektet
    if (leaderboard.length > 0) {
      console.log('📊 Sample stat object:', JSON.stringify(leaderboard[0], null, 2));
    }
    
    res.json(leaderboard);
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
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
// 🔥 FIXAD VERSION av /leaderboards/:id/stats endpoint
// Lägg till detta i backend/routes/api.js (ersätt befintlig endpoint)

router.get('/leaderboards/:id/stats', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.getLeaderboard(req.params.id);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    const { startDate, endDate } = leaderboardService.getDateRange(leaderboard);

    // AUTO-SYNC PERSISTENT DEALS CACHE (var 6:e timme)
    await dealsCache.autoSync(adversusAPI);
    
    // 📱 AUTO-SYNC SMS CACHE (var 6:e timme)
    await smsCache.autoSync(adversusAPI);
    
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
    console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    
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
        { id: 74126, value: deal.multiDeals },
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
        const targetGroupIds = leaderboard.userGroups.map(id => parseInt(id));
        filteredUserIds = new Set();
        
        // 🔥 FIXED: Hämta ALLA users från de valda grupperna (inte bara de med deals!)
        console.log(`   📋 Finding ALL users in ${targetGroupIds.length} target groups...`);
        
        // Loop genom ALLA adversus users och kolla vilka som tillhör grupperna
        for (const adversusUser of adversusUsers) {
          if (adversusUser.group && adversusUser.group.id) {
            const userGroupId = parseInt(adversusUser.group.id);
            
            // Kolla om user's primary group matchar någon av target groups
            if (targetGroupIds.includes(userGroupId)) {
              filteredUserIds.add(adversusUser.id);
              console.log(`   ✅ User ${adversusUser.id} (${adversusUser.name}) matched (group: ${userGroupId})`);
            }
          }
        }
        
        console.log(`   📊 Filter result: ${filteredUserIds.size} users in selected groups`);
        
        // Om inga users matchar, behåll tom Set (visar inga users)
        if (filteredUserIds.size === 0) {
          console.log(`   ⚠️  No users found in the selected groups`);
        }
      } catch (error) {
        console.error(`❌ Error filtering user groups:`, error.message);
        // Om något går fel, behåll tom Set för säkerhet
        filteredUserIds = new Set();
        console.log(`   ⚠️  Filtering failed - returning empty leaderboard for safety`);
      }
    }
    
    const localAgents = await database.getAgents();
    
    // 🔥 FIXED: Initialize stats for ALL filtered users (även de med 0 deals!)
    const stats = {};
    
    if (filteredUserIds) {
      // Om vi har filter, skapa entries för ALLA users i grupperna
      for (const userId of filteredUserIds) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0
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
          dealCount: 0
        };
      }
      
      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commission = parseFloat(commissionField?.value || 0);
      
      // 🔥 FIX: Använd multiDeals field ID 74126
      const multiDealsField = lead.resultData?.find(f => f.id === 74126);
      const multiDealsValue = parseInt(multiDealsField?.value || '1') || 1;
      
      stats[userId].totalCommission += commission;
      stats[userId].dealCount += multiDealsValue;  // ✅ ANVÄND multiDealsValue
    });
    
    // 📱 ============= NY SEKTION: LÄGG TILL SMS DATA =============
    console.log('📱 Fetching SMS stats for all users...');
    
    // Bygg leaderboard stats med SMS-data
    const leaderboardStats = await Promise.all(
      Object.values(stats).map(async (stat) => {
        const adversusUser = adversusUsers.find(u => String(u.id) === String(stat.userId));
        const localAgent = localAgents.find(a => String(a.userId) === String(stat.userId));
        
        let agentName = `Agent ${stat.userId}`;
        if (adversusUser) {
          agentName = adversusUser.name || 
                     `${adversusUser.firstname || ''} ${adversusUser.lastname || ''}`.trim() ||
                     `Agent ${stat.userId}`;
        }
        
         // 📱 HÄMTA SMS STATS för denna user
        let smsData = {
          uniqueSMS: 0,
          successRate: 0,
          totalDeals: stat.dealCount
        };
        
        try {
          smsData = smsCache.getSMSSuccessRate(
            stat.userId,
            startDate.toISOString(),
            endDate.toISOString(),
            stat.dealCount
          );
          
          // 🔥 DEBUG: Logga vad getSMSSuccessRate returnerar
          console.log(`📊 getSMSSuccessRate returned for user ${stat.userId}:`, {
            uniqueSMS: smsData.uniqueSMS,
            successRate: smsData.successRate
          });
          
        } catch (error) {
          console.error(`⚠️ Failed to get SMS stats for user ${stat.userId}:`, error.message);
        }
        
        // ✅ RETURNERA KOMPLETT OBJEKT MED SMS-DATA
        return {
          userId: stat.userId,
          dealCount: stat.dealCount || 0,
          totalCommission: stat.totalCommission || 0,
          uniqueSMS: smsData.uniqueSMS || 0,
          smsSuccessRate: smsData.successRate || 0,
          agent: {
            id: stat.userId,
            userId: stat.userId,
            name: agentName,
            email: adversusUser?.email || '',
            profileImage: localAgent?.profileImage || null
          }
        };
      })
    );
    
    // Sortera efter commission
    leaderboardStats.sort((a, b) => b.totalCommission - a.totalCommission);
    
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
    console.log(`   - ${leaderboardStats.filter(s => s.dealCount === 0).length} with 0 deals`);
    console.log(`   - ${leaderboardStats.filter(s => s.uniqueSMS > 0).length} with SMS data`);
    
    // 🐛 DEBUG: Visa första objektet
    if (leaderboardStats.length > 0) {
      console.log('📊 Sample response object:', JSON.stringify(leaderboardStats[0], null, 2));
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Error fetching leaderboard stats:', error.message);
    console.error('Stack:', error.stack);
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

// ==================== GROUPS ====================

// Get available groups (KORREKT METOD - från user.group.id)
router.get('/groups/available', async (req, res) => {
  try {
    const groups = await notificationSettings.getAvailableGroups(adversusAPI);
    
    res.json({
      success: true,
      groups: groups
    });
  } catch (error) {
    console.error('Error fetching available groups:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
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

// ==================== SMS MANAGEMENT ====================

// Sync SMS from Adversus
router.post('/sms/sync', async (req, res) => {
  try {
    console.log('🔄 Manual SMS sync triggered from admin');
    const sms = await smsCache.forceSync(adversusAPI);
    
    res.json({ 
      success: true, 
      message: `Synced ${sms.length} SMS`,
      count: sms.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMS stats
router.get('/sms/stats', async (req, res) => {
  try {
    const stats = await smsCache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMS for specific agent
router.get('/sms/agent/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const uniqueSMS = smsCache.getUniqueSMSForAgent(
      parseInt(userId), 
      startDate, 
      endDate
    );

    const smsStats = await smsCache.getSMSStatsForAgent(
      parseInt(userId),
      startDate,
      endDate,
      dealsCache
    );

    res.json({
      userId: parseInt(userId),
      uniqueSMS,
      ...smsStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clean old SMS
router.post('/sms/clean', async (req, res) => {
  try {
    const result = await smsCache.cleanOldSMS();
    res.json({ 
      success: true, 
      message: `Cleaned ${result.removed} old SMS`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear SMS cache
router.delete('/sms/cache', async (req, res) => {
  try {
    await smsCache.saveCache([]);
    console.log('✅ Cleared sms-cache.json');
    
    res.json({ 
      success: true, 
      message: 'Cleared SMS cache'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
