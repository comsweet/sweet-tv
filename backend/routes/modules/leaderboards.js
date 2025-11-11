const express = require('express');
const router = express.Router();
const multer = require('multer');
const { logoStorage } = require('../../config/cloudinary');
const adversusAPI = require('../../services/adversusAPI');
const database = require('../../services/database');
const leaderboardService = require('../../services/leaderboards');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const loginTimeCache = require('../../services/loginTimeCache');
const leaderboardCache = require('../../services/leaderboardCache');
const campaignCache = require('../../services/campaignCache');
const campaignBonusTiers = require('../../services/campaignBonusTiers');

// Multer upload for logos
const upload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ==================== LEADERBOARDS ====================

// Get all leaderboards
router.get('/', async (req, res) => {
  try {
    const leaderboards = await leaderboardService.getLeaderboards();
    res.json(leaderboards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active leaderboards
router.get('/active', async (req, res) => {
  try {
    const activeLeaderboards = await leaderboardService.getActiveLeaderboards();
    res.json(activeLeaderboards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single leaderboard
router.get('/:id', async (req, res) => {
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

// Get leaderboard stats with SMS data and bonus tiers
router.get('/:id/stats', async (req, res) => {
  try {
    const leaderboardId = req.params.id;

    // Get leaderboard config
    const leaderboard = await leaderboardService.getLeaderboard(leaderboardId);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Calculate date range
    const { startDate, endDate } = leaderboardService.getDateRange(leaderboard);
    console.log(`📊 [${leaderboard.name}] Fetching stats from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Check cache first
    const cacheKey = `${leaderboardId}-${startDate.toISOString()}-${endDate.toISOString()}`;
    const cached = leaderboardCache.get(leaderboardId, startDate.toISOString(), endDate.toISOString());

    if (cached) {
      console.log(`✅ Returning cached stats for ${leaderboard.name}`);
      return res.json(cached);
    }

    // AUTO-SYNC DEALS CACHE
    await dealsCache.autoSync(adversusAPI);

    // AUTO-SYNC SMS CACHE
    await smsCache.autoSync(adversusAPI);

    // AUTO-SYNC LOGIN TIME (only if needed - every 30 minutes)
    if (await loginTimeCache.needsSync()) {
      console.log(`⏱️ Login time sync needed, fetching for active users...`);
      // We'll sync login time per user below when building stats
    }

    // Get deals from cache
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);

    // Convert cached deals to lead format
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

    console.log(`✅ Loaded ${leads.length} deals from cache`);

    // Get users and agents
    let adversusUsers = [];
    let localAgents = [];

    try {
      const usersResult = await adversusAPI.getUsers();
      adversusUsers = usersResult.users || [];
    } catch (error) {
      console.error('⚠️ Failed to load Adversus users:', error.message);
    }

    try {
      localAgents = await database.getAgents();
    } catch (error) {
      console.error('⚠️ Failed to load local agents:', error.message);
    }

    // Filter by user groups if specified
    let filteredLeads = leads;
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      // Normalize userGroups to strings for comparison
      const normalizedGroups = leaderboard.userGroups.map(g => String(g));

      console.log(`🔍 Filtering by user groups: ${normalizedGroups.join(', ')}`);

      // Find all users in the selected groups
      const allowedUserIds = adversusUsers
        .filter(u => {
          if (!u.group || !u.group.id) {
            return false;
          }
          const userGroupId = String(u.group.id);
          const isAllowed = normalizedGroups.includes(userGroupId);

          if (isAllowed) {
            console.log(`  ✅ User ${u.id} (${u.name || 'Unknown'}) in group ${userGroupId} - INCLUDED`);
          }

          return isAllowed;
        })
        .map(u => String(u.id)); // Convert user IDs to strings

      console.log(`  📋 Found ${allowedUserIds.length} users in selected groups`);

      // Filter deals by these user IDs (normalize lead.lastContactedBy to string)
      filteredLeads = leads.filter(lead => {
        const leadUserId = String(lead.lastContactedBy);
        return allowedUserIds.includes(leadUserId);
      });

      console.log(`🔍 Filtered ${leads.length} → ${filteredLeads.length} deals by groups: ${normalizedGroups.join(', ')}`);
    }

    // Calculate stats
    const stats = {};

    // IMPORTANT: Initialize stats for ALL users first (so users with 0 deals show up)
    // If userGroups filter is active, only add users from those groups
    // If no filter, add ALL adversus users
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      // Filter active: Only users from selected groups
      const normalizedGroups = leaderboard.userGroups.map(g => String(g));
      const usersInSelectedGroups = adversusUsers.filter(u => {
        if (!u.group || !u.group.id) return false;
        const userGroupId = String(u.group.id);
        return normalizedGroups.includes(userGroupId);
      });

      usersInSelectedGroups.forEach(user => {
        stats[user.id] = {
          userId: user.id,
          totalCommission: 0,
          dealCount: 0
        };
      });
      console.log(`  📋 Initialized ${usersInSelectedGroups.length} users from selected groups`);
    } else {
      // No filter: Add ALL adversus users
      adversusUsers.forEach(user => {
        stats[user.id] = {
          userId: user.id,
          totalCommission: 0,
          dealCount: 0
        };
      });
      console.log(`  📋 Initialized ${adversusUsers.length} users (no group filter)`);
    }

    // Then add deal data for users who have deals
    filteredLeads.forEach(lead => {
      const userId = lead.lastContactedBy;
      if (!userId) return;

      // Create entry if user not in adversusUsers (shouldn't happen, but safety)
      if (!stats[userId]) {
        stats[userId] = {
          userId: userId,
          totalCommission: 0,
          dealCount: 0
        };
      }

      const commissionField = lead.resultData?.find(f => f.id === 70163);
      const commission = parseFloat(commissionField?.value || 0);

      const multiDealsField = lead.resultData?.find(f => f.id === 74126);
      const multiDealsValue = parseInt(multiDealsField?.value || '1');

      stats[userId].totalCommission += commission;
      stats[userId].dealCount += multiDealsValue;
    });

    // ==================== CAMPAIGN BONUS CALCULATION ====================
    // Beräkna campaign bonus per agent, per dag, per kampanj-grupp
    console.log(`💰 Calculating campaign bonus for ${Object.keys(stats).length} agents...`);

    const campaignBonusPerAgent = {};

    // Gruppera deals per agent
    for (const deal of cachedDeals) {
      const userId = String(deal.userId);

      // Skip if not in filtered leads
      if (!stats[userId]) continue;

      if (!campaignBonusPerAgent[userId]) {
        campaignBonusPerAgent[userId] = {};
      }

      // Get campaign group
      let campaignGroup = 'Unknown';
      try {
        const campaignInfo = await campaignCache.getCampaignInfo(deal.campaignId, adversusAPI);
        campaignGroup = campaignInfo.group;
      } catch (error) {
        console.error(`⚠️ Failed to get campaign group for ${deal.campaignId}:`, error.message);
      }

      // Extract date (YYYY-MM-DD) from orderDate
      const dealDate = new Date(deal.orderDate).toISOString().split('T')[0];

      // Initialize structure: agent -> date -> campaignGroup -> deals[]
      if (!campaignBonusPerAgent[userId][dealDate]) {
        campaignBonusPerAgent[userId][dealDate] = {};
      }

      if (!campaignBonusPerAgent[userId][dealDate][campaignGroup]) {
        campaignBonusPerAgent[userId][dealDate][campaignGroup] = {
          deals: [],
          totalDeals: 0
        };
      }

      // Add deal
      const multiDeals = parseInt(deal.multiDeals || '1');
      campaignBonusPerAgent[userId][dealDate][campaignGroup].deals.push({
        leadId: deal.leadId,
        multiDeals: multiDeals,
        commission: deal.commission
      });
      campaignBonusPerAgent[userId][dealDate][campaignGroup].totalDeals += multiDeals;
    }

    // Calculate bonus for each agent
    for (const userId in campaignBonusPerAgent) {
      let totalBonus = 0;
      const bonusDetails = [];

      for (const date in campaignBonusPerAgent[userId]) {
        for (const campaignGroup in campaignBonusPerAgent[userId][date]) {
          const groupData = campaignBonusPerAgent[userId][date][campaignGroup];
          const dealsCount = groupData.totalDeals;

          // Calculate bonus for this group on this date
          const bonus = campaignBonusTiers.calculateBonusForDeals(campaignGroup, dealsCount);

          if (bonus > 0) {
            totalBonus += bonus;
            bonusDetails.push({
              date,
              campaignGroup,
              deals: dealsCount,
              bonus
            });
          }
        }
      }

      // Add to stats
      stats[userId].campaignBonus = totalBonus;
      stats[userId].campaignBonusDetails = bonusDetails;
    }

    // Ensure all agents have campaignBonus field (even if 0)
    for (const userId in stats) {
      if (!stats[userId].campaignBonus) {
        stats[userId].campaignBonus = 0;
        stats[userId].campaignBonusDetails = [];
      }
    }

    console.log(`✅ Campaign bonus calculated for ${Object.keys(campaignBonusPerAgent).length} agents`);

    // Build complete stats array with SMS and campaign bonus data
    const statsArray = await Promise.all(
      Object.values(stats).map(async (stat) => {
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

        // Get SMS data
        let smsData = { uniqueSMS: 0, successRate: 0 };
        try {
          smsData = await smsCache.getSMSSuccessRate(stat.userId, startDate, endDate, stat.dealCount);
        } catch (error) {
          console.error(`⚠️ Failed to get SMS stats for user ${stat.userId}:`, error.message);
        }

        // Get login time data (for deals per hour calculation)
        let loginTimeData = { loginSeconds: 0, loginHours: 0, dealsPerHour: 0 };
        try {
          // Try to get cached login time first
          let loginTime = await loginTimeCache.getLoginTime(stat.userId, startDate, endDate);

          // If no data or stale data, fetch from Adversus
          if (!loginTime || loginTime.loginSeconds === 0) {
            loginTime = await loginTimeCache.fetchLoginTimeFromAdversus(adversusAPI, stat.userId, startDate, endDate);
            await loginTimeCache.saveLoginTime(loginTime);
          }

          const loginSeconds = loginTime.loginSeconds || 0;
          const loginHours = loginSeconds > 0 ? (loginSeconds / 3600).toFixed(2) : 0;
          const dealsPerHour = loginTimeCache.calculateDealsPerHour(stat.dealCount || 0, loginSeconds);

          loginTimeData = {
            loginSeconds,
            loginHours: parseFloat(loginHours),
            dealsPerHour
          };
        } catch (error) {
          console.error(`⚠️ Failed to get login time for user ${stat.userId}:`, error.message);
        }

        return {
          userId: stat.userId,
          dealCount: stat.dealCount || 0,
          totalCommission: stat.totalCommission || 0,
          uniqueSMS: smsData.uniqueSMS || 0,
          smsSuccessRate: smsData.successRate || 0,
          campaignBonus: stat.campaignBonus || 0,
          campaignBonusDetails: stat.campaignBonusDetails || [],
          loginSeconds: loginTimeData.loginSeconds || 0,
          loginHours: loginTimeData.loginHours || 0,
          dealsPerHour: loginTimeData.dealsPerHour || 0,
          agent: {
            id: stat.userId,
            userId: stat.userId,
            name: agentName,
            email: adversusUser?.email || '',
            profileImage: localAgent?.profileImage || null,
            groupName: adversusUser?.group?.name || null
          }
        };
      })
    );

    // ==================== GROUP-BASED AGGREGATION ====================
    let finalStats = statsArray;

    if (leaderboard.displayMode === 'groups') {
      console.log(`👥 Aggregating stats by user groups...`);

      // Group stats by user group
      const groupStats = {};

      for (const stat of statsArray) {
        const groupName = stat.agent.groupName || 'Ingen Grupp';

        if (!groupStats[groupName]) {
          groupStats[groupName] = {
            groupName: groupName,
            totalCommission: 0,
            dealCount: 0,
            uniqueSMS: 0,
            campaignBonus: 0,
            agentCount: 0,
            agents: []
          };
        }

        groupStats[groupName].totalCommission += stat.totalCommission;
        groupStats[groupName].dealCount += stat.dealCount;
        groupStats[groupName].uniqueSMS += stat.uniqueSMS;
        groupStats[groupName].campaignBonus += stat.campaignBonus;
        groupStats[groupName].agentCount += 1;
        groupStats[groupName].agents.push({
          name: stat.agent.name,
          dealCount: stat.dealCount,
          commission: stat.totalCommission
        });
      }

      // Convert to array and calculate averages
      finalStats = Object.values(groupStats).map(group => ({
        groupName: group.groupName,
        dealCount: group.dealCount,
        totalCommission: group.totalCommission,
        uniqueSMS: group.uniqueSMS,
        campaignBonus: group.campaignBonus,
        agentCount: group.agentCount,
        avgCommission: group.agentCount > 0 ? group.totalCommission / group.agentCount : 0,
        avgDeals: group.agentCount > 0 ? group.dealCount / group.agentCount : 0,
        agents: group.agents
      }));

      console.log(`✅ Aggregated into ${finalStats.length} groups`);
    }

    // Sort based on leaderboard.sortBy configuration
    const sortBy = leaderboard.sortBy || 'commission';

    if (leaderboard.displayMode === 'groups') {
      // Sort groups
      if (sortBy === 'total') {
        finalStats.sort((a, b) => ((b.totalCommission + b.campaignBonus) - (a.totalCommission + a.campaignBonus)));
      } else if (sortBy === 'dealCount') {
        finalStats.sort((a, b) => b.dealCount - a.dealCount);
      } else {
        finalStats.sort((a, b) => b.totalCommission - a.totalCommission);
      }
    } else {
      // Sort individuals
      if (sortBy === 'total') {
        finalStats.sort((a, b) =>
          ((b.totalCommission + b.campaignBonus) - (a.totalCommission + a.campaignBonus))
        );
      } else if (sortBy === 'dealCount') {
        finalStats.sort((a, b) => b.dealCount - a.dealCount);
      } else {
        finalStats.sort((a, b) => b.totalCommission - a.totalCommission);
      }
    }

    // ==================== TOP N FILTERING ====================
    if (leaderboard.topN && leaderboard.topN > 0) {
      console.log(`🔝 Limiting to top ${leaderboard.topN} results`);
      finalStats = finalStats.slice(0, leaderboard.topN);
    }

    // ==================== GAP CALCULATIONS ====================
    if (leaderboard.showGap && finalStats.length > 0) {
      const leaderValue = sortBy === 'total'
        ? (finalStats[0].totalCommission + finalStats[0].campaignBonus)
        : sortBy === 'dealCount'
        ? finalStats[0].dealCount
        : finalStats[0].totalCommission;

      finalStats.forEach((stat, index) => {
        if (index === 0) {
          stat.gapToLeader = 0;
        } else {
          const currentValue = sortBy === 'total'
            ? (stat.totalCommission + stat.campaignBonus)
            : sortBy === 'dealCount'
            ? stat.dealCount
            : stat.totalCommission;

          stat.gapToLeader = leaderValue - currentValue;
        }
      });
    }

    // ==================== MINI STATS ====================
    let miniStats = null;
    if (leaderboard.showMiniStats) {
      const totalCommission = finalStats.reduce((sum, s) => sum + (s.totalCommission || 0), 0);
      const totalDeals = finalStats.reduce((sum, s) => sum + (s.dealCount || 0), 0);
      const totalBonus = finalStats.reduce((sum, s) => sum + (s.campaignBonus || 0), 0);
      const totalSMS = finalStats.reduce((sum, s) => sum + (s.uniqueSMS || 0), 0);

      miniStats = {
        totalCommission,
        totalDeals,
        totalBonus,
        totalSMS,
        grandTotal: totalCommission + totalBonus,
        participantCount: finalStats.length
      };
    }

    const response = {
      leaderboard: leaderboard,
      stats: finalStats,
      miniStats: miniStats,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    };

    // Cache the result
    leaderboardCache.set(leaderboardId, startDate.toISOString(), endDate.toISOString(), response);

    console.log(`📈 Leaderboard "${leaderboard.name}" with ${finalStats.length} ${leaderboard.displayMode === 'groups' ? 'groups' : 'agents'}`);

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching leaderboard stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create leaderboard
router.post('/', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.createLeaderboard(req.body);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update leaderboard
router.put('/:id', async (req, res) => {
  try {
    const leaderboard = await leaderboardService.updateLeaderboard(req.params.id, req.body);

    // Invalidate cache for this leaderboard
    leaderboardCache.invalidate(req.params.id);

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get leaderboard historical trend data
router.get('/:id/history', async (req, res) => {
  try {
    const leaderboardId = req.params.id;
    const { hours = 24, topN = 5, metric = 'commission' } = req.query;

    // Get leaderboard config
    const leaderboard = await leaderboardService.getLeaderboard(leaderboardId);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Calculate date range (last N hours)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - parseInt(hours));

    console.log(`📈 [${leaderboard.name}] Fetching history from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get deals from cache
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);

    // Get users
    let adversusUsers = [];
    try {
      const usersResult = await adversusAPI.getUsers();
      adversusUsers = usersResult.users || [];
    } catch (error) {
      console.error('⚠️ Failed to load Adversus users:', error.message);
    }

    // Filter by user groups if specified
    let filteredDeals = cachedDeals;
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      const normalizedGroups = leaderboard.userGroups.map(g => String(g));
      const allowedUserIds = adversusUsers
        .filter(u => u.group && u.group.id && normalizedGroups.includes(String(u.group.id)))
        .map(u => String(u.id));

      filteredDeals = cachedDeals.filter(deal =>
        allowedUserIds.includes(String(deal.userId))
      );
    }

    // Group deals by hour and userId
    const hourlyData = {};

    for (const deal of filteredDeals) {
      const dealDate = new Date(deal.orderDate);
      const hourKey = new Date(dealDate.getFullYear(), dealDate.getMonth(), dealDate.getDate(), dealDate.getHours()).toISOString();
      const userId = String(deal.userId);

      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = {};
      }

      if (!hourlyData[hourKey][userId]) {
        hourlyData[hourKey][userId] = {
          commission: 0,
          deals: 0
        };
      }

      hourlyData[hourKey][userId].commission += parseFloat(deal.commission || 0);
      hourlyData[hourKey][userId].deals += parseInt(deal.multiDeals || '1');
    }

    // Calculate cumulative totals for each user
    const userTotals = {};
    const sortedHours = Object.keys(hourlyData).sort();

    for (const userId of new Set(filteredDeals.map(d => String(d.userId)))) {
      userTotals[userId] = {
        totalCommission: 0,
        totalDeals: 0
      };
    }

    // Build time series
    const timeSeries = sortedHours.map(hourKey => {
      const hour = hourlyData[hourKey];

      // Update cumulative totals
      for (const userId in hour) {
        if (userTotals[userId]) {
          userTotals[userId].totalCommission += hour[userId].commission;
          userTotals[userId].totalDeals += hour[userId].deals;
        }
      }

      // Build data point with cumulative values
      const dataPoint = { time: hourKey };
      for (const userId in userTotals) {
        const adversusUser = adversusUsers.find(u => String(u.id) === userId);
        const userName = adversusUser?.name || adversusUser?.firstname || `Agent ${userId}`;

        if (metric === 'deals') {
          dataPoint[userName] = userTotals[userId].totalDeals;
        } else {
          dataPoint[userName] = Math.round(userTotals[userId].totalCommission);
        }
      }

      return dataPoint;
    });

    // Find top N users by final total
    const finalTotals = Object.entries(userTotals)
      .map(([userId, totals]) => {
        const adversusUser = adversusUsers.find(u => String(u.id) === userId);
        return {
          userId,
          name: adversusUser?.name || adversusUser?.firstname || `Agent ${userId}`,
          total: metric === 'deals' ? totals.totalDeals : totals.totalCommission
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, parseInt(topN));

    // Filter time series to only include top N users
    const topUserNames = finalTotals.map(u => u.name);
    const filteredTimeSeries = timeSeries.map(point => {
      const filtered = { time: point.time };
      for (const name of topUserNames) {
        filtered[name] = point[name] || 0;
      }
      return filtered;
    });

    res.json({
      leaderboard: {
        id: leaderboard.id,
        name: leaderboard.name
      },
      timeSeries: filteredTimeSeries,
      topUsers: finalTotals,
      metric: metric,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching leaderboard history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete leaderboard
router.delete('/:id', async (req, res) => {
  try {
    await leaderboardService.deleteLeaderboard(req.params.id);

    // Invalidate cache
    leaderboardCache.invalidate(req.params.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload logo for leaderboard
router.post('/:id/logo', upload.single('image'), async (req, res) => {
  try {
    const leaderboardId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const logoUrl = req.file.path;

    // Update leaderboard with logo
    const leaderboard = await leaderboardService.getLeaderboard(leaderboardId);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    await leaderboardService.updateLeaderboard(leaderboardId, {
      ...leaderboard,
      logo: logoUrl
    });

    console.log(`✅ Logo uploaded for leaderboard ${leaderboardId}: ${logoUrl}`);
    res.json({ logoUrl });
  } catch (error) {
    console.error('Error uploading leaderboard logo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Migration endpoint: Add dealsPerHour to all existing leaderboards
router.post('/migrate/add-deals-per-hour', async (req, res) => {
  try {
    console.log('🔄 Starting migration: Adding dealsPerHour to all leaderboards...');

    const leaderboards = await leaderboardService.getLeaderboards();
    let updatedCount = 0;

    for (const leaderboard of leaderboards) {
      let needsUpdate = false;

      // Add dealsPerHour to visibleColumns if not present
      if (!leaderboard.visibleColumns) {
        leaderboard.visibleColumns = {
          dealsPerHour: true,
          deals: true,
          sms: true,
          commission: true,
          campaignBonus: true,
          total: true
        };
        needsUpdate = true;
      } else if (!leaderboard.visibleColumns.hasOwnProperty('dealsPerHour')) {
        leaderboard.visibleColumns.dealsPerHour = true;
        needsUpdate = true;
      }

      // Add dealsPerHour to columnOrder if not present
      if (!leaderboard.columnOrder) {
        leaderboard.columnOrder = ['dealsPerHour', 'deals', 'sms', 'commission', 'campaignBonus', 'total'];
        needsUpdate = true;
      } else if (!leaderboard.columnOrder.includes('dealsPerHour')) {
        // Add dealsPerHour at the beginning
        leaderboard.columnOrder = ['dealsPerHour', ...leaderboard.columnOrder];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await leaderboardService.updateLeaderboard(leaderboard.id, leaderboard);
        updatedCount++;
        console.log(`✅ Updated leaderboard: ${leaderboard.name}`);
      }
    }

    console.log(`🎉 Migration complete! Updated ${updatedCount} leaderboards`);

    res.json({
      success: true,
      message: `Migration complete: ${updatedCount} leaderboards updated`,
      totalLeaderboards: leaderboards.length,
      updatedCount
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
