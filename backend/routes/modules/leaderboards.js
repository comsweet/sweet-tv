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
const userCache = require('../../services/userCache');

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
    console.log(`   ⏰ Current server time (UTC): ${new Date().toISOString()}`);
    console.log(`   📅 Time period: ${leaderboard.timePeriod}`);
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      console.log(`   👥 User groups filter: ${leaderboard.userGroups.join(', ')}`);
    }

    // Check cache first
    const cacheKey = `${leaderboardId}-${startDate.toISOString()}-${endDate.toISOString()}`;
    const cached = leaderboardCache.get(leaderboardId, startDate.toISOString(), endDate.toISOString());

    if (cached) {
      const statsCount = cached.stats?.length || 0;
      const dealsCount = cached.stats?.reduce((sum, s) => sum + (s.dealCount || 0), 0) || 0;
      console.log(`✅ Returning cached stats for ${leaderboard.name}: ${statsCount} agents, ${dealsCount} deals`);
      return res.json(cached);
    }

    // NOTE: Central sync scheduler handles all cache updates every 3 minutes
    // This endpoint just reads from cache (no sync calls to avoid rate limiting)

    // Get deals from cache
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);
    console.log(`   💾 Found ${cachedDeals.length} deals in cache for date range`);

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

    // Use cached users with fallback to API if not initialized
    adversusUsers = await userCache.getUsers({ adversusAPI });

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

    // SYNC LOGIN TIME FOR ALL USERS (before processing each one)
    // This avoids rate limiting by using workforce API - ONE call for ALL users!
    const userIds = Object.keys(stats);
    if (userIds.length > 0 && await loginTimeCache.needsSync()) {
      console.log(`\n⏱️ Syncing login time for ${userIds.length} users before building stats...`);
      try {
        await loginTimeCache.syncLoginTimeForUsers(adversusAPI, userIds, startDate, endDate);
      } catch (error) {
        console.error(`⚠️ Failed to sync login times (will try individually):`, error.message);
      }
    }

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
          // Get cached login time (already synced above via syncLoginTimeForUsers)
          let loginTime = await loginTimeCache.getLoginTime(stat.userId, startDate, endDate);

          const loginSeconds = loginTime?.loginSeconds || 0;
          const loginHours = loginSeconds > 0 ? (loginSeconds / 3600).toFixed(2) : 0;
          const dealsPerHour = loginTimeCache.calculateDealsPerHour(stat.dealCount || 0, loginSeconds);

          // 🔍 DEBUG: Log order/h calculation details
          if (dealsPerHour > 0) {
            console.log(`   🕒 User ${stat.userId} (${agentName}) order/h: ${dealsPerHour} = ${stat.dealCount} deals / ${loginHours}h (${loginSeconds}s)`);
            if (loginTime?.fromDate && loginTime?.toDate) {
              console.log(`      📅 Login time period: ${new Date(loginTime.fromDate).toISOString().split('T')[0]} → ${new Date(loginTime.toDate).toISOString().split('T')[0]}`);
            }
          }

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

    // 🛡️ ULTIMATE SAFETY: If empty stats AND we have fallback data, use it!
    let response;
    if (!finalStats || finalStats.length === 0) {
      console.warn(`\n⚠️ ⚠️ ⚠️  EMPTY STATS DETECTED for "${leaderboard.name}"!`);
      console.warn(`   📊 Deals in cache: ${cachedDeals.length}`);
      console.warn(`   📊 Filtered deals (after group filter): ${filteredLeads.length}`);
      console.warn(`   📊 Stats object keys: ${Object.keys(stats).length}`);
      console.warn(`   📊 Stats array (after processing): ${statsArray.length}`);
      console.warn(`   📊 Final stats (after sorting/filtering): ${finalStats.length}`);
      console.warn(`   👥 User groups filter: ${leaderboard.userGroups && leaderboard.userGroups.length > 0 ? leaderboard.userGroups.join(', ') : 'NONE'}`);
      console.warn(`   📅 Date range: ${startDate.toISOString()} → ${endDate.toISOString()}`);
      console.warn(`   ⏰ Current UTC time: ${new Date().toISOString()}`);

      // Try to use fallback data
      const fallbackData = leaderboardCache.getLastGood(leaderboardId, startDate.toISOString(), endDate.toISOString());
      if (fallbackData) {
        console.warn(`   🆘 Using FALLBACK data instead of empty stats!`);
        response = fallbackData;
      } else {
        console.warn(`   ❌ No fallback data available - returning empty stats`);
        console.warn(`   🔍 This should ONLY happen on first load or if legitimately NO deals exist!\n`);

        response = {
          leaderboard: leaderboard,
          stats: finalStats,
          miniStats: miniStats,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        };
      }
    } else {
      response = {
        leaderboard: leaderboard,
        stats: finalStats,
        miniStats: miniStats,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      };

      // Cache the result (and save as fallback if non-empty)
      leaderboardCache.set(leaderboardId, startDate.toISOString(), endDate.toISOString(), response);
    }

    console.log(`📈 Returning leaderboard "${leaderboard.name}" with ${response.stats.length} ${leaderboard.displayMode === 'groups' ? 'groups' : 'agents'}`);

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
    const {
      hours,
      days,
      metric = 'commission',
      metrics // Optional: JSON array for multi-metric e.g. [{"metric":"commission","axis":"left"},{"metric":"sms_rate","axis":"right"}]
    } = req.query;

    // Parse metrics if provided (for dual Y-axis support)
    let metricsToFetch = [];
    if (metrics) {
      try {
        metricsToFetch = JSON.parse(metrics);
      } catch (e) {
        metricsToFetch = [{ metric, axis: 'left' }];
      }
    } else {
      // Single metric mode (backward compatible)
      metricsToFetch = [{ metric, axis: 'left' }];
    }

    // Get leaderboard config
    const leaderboard = await leaderboardService.getLeaderboard(leaderboardId);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();

    // Support both hours (old) and days (new)
    if (days) {
      startDate.setDate(startDate.getDate() - parseInt(days));
    } else {
      startDate.setHours(startDate.getHours() - parseInt(hours || 24));
    }

    const groupByDay = !!days; // Group by day if days param is used

    console.log(`📈 [${leaderboard.name}] Fetching history from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   📊 Grouping by: ${groupByDay ? 'DAY' : 'HOUR'}, Metrics: ${metrics || metric}`);
    console.log(`   👥 User Groups filter: ${leaderboard.userGroups && leaderboard.userGroups.length > 0 ? leaderboard.userGroups.join(', ') : 'ALLA (tomt filter)'}`);

    // Get data from caches
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);
    const cachedSMS = await smsCache.getSMSInRange(startDate, endDate);

    // Get users
    let adversusUsers = [];
    // Use cached users with fallback to API if not initialized
    adversusUsers = await userCache.getUsers({ adversusAPI });

    // Filter by user groups if specified
    let filteredDeals = cachedDeals;
    let filteredSMS = cachedSMS;
    let allowedUserIds = [];

    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      const normalizedGroups = leaderboard.userGroups.map(g => String(g));
      allowedUserIds = adversusUsers
        .filter(u => u.group && u.group.id && normalizedGroups.includes(String(u.group.id)))
        .map(u => String(u.id));

      console.log(`   🔍 Filtered to ${allowedUserIds.length} users from selected groups`);

      filteredDeals = cachedDeals.filter(deal =>
        allowedUserIds.includes(String(deal.userId))
      );
      filteredSMS = cachedSMS.filter(sms =>
        allowedUserIds.includes(String(sms.userId))
      );
    } else {
      allowedUserIds = adversusUsers.map(u => String(u.id));
      console.log(`   🔍 No filter - using all ${allowedUserIds.length} users`);
    }

    console.log(`   📦 Filtered deals: ${filteredDeals.length}, Filtered SMS: ${filteredSMS.length}`);

    // Create userId to groupId mapping (only for filtered users)
    const userGroupMap = {};
    const groupNames = {};

    for (const user of adversusUsers) {
      const userId = String(user.id);
      // Only map users that are in allowedUserIds
      if (user.group && user.group.id && allowedUserIds.includes(userId)) {
        const groupId = String(user.group.id);
        userGroupMap[userId] = groupId;
        groupNames[groupId] = user.group.name || `Group ${groupId}`;
      }
    }

    console.log(`   📊 User groups found: ${Object.keys(groupNames).map(id => groupNames[id]).join(', ')}`);

    // Group data by time period (hour or day) and user GROUP instead of individual user
    const timeData = {};

    for (const deal of filteredDeals) {
      const dealDate = new Date(deal.orderDate);
      let timeKey;

      if (groupByDay) {
        timeKey = new Date(dealDate.getFullYear(), dealDate.getMonth(), dealDate.getDate()).toISOString();
      } else {
        timeKey = new Date(dealDate.getFullYear(), dealDate.getMonth(), dealDate.getDate(), dealDate.getHours()).toISOString();
      }

      const userId = String(deal.userId);
      const groupId = userGroupMap[userId];

      if (!groupId) continue; // Skip users without groups

      if (!timeData[timeKey]) {
        timeData[timeKey] = {};
      }

      if (!timeData[timeKey][groupId]) {
        timeData[timeKey][groupId] = {
          commission: 0,
          deals: 0,
          loginSeconds: 0,
          smsSent: 0,
          smsDelivered: 0,
          userIds: new Set()
        };
      }

      timeData[timeKey][groupId].commission += parseFloat(deal.commission || 0);
      timeData[timeKey][groupId].deals += parseInt(deal.multiDeals || '1');
      timeData[timeKey][groupId].userIds.add(userId);
    }

    // Add SMS data (grouped by user group)
    for (const sms of filteredSMS) {
      const smsDate = new Date(sms.timestamp);
      let timeKey;

      if (groupByDay) {
        timeKey = new Date(smsDate.getFullYear(), smsDate.getMonth(), smsDate.getDate()).toISOString();
      } else {
        timeKey = new Date(smsDate.getFullYear(), smsDate.getMonth(), smsDate.getDate(), smsDate.getHours()).toISOString();
      }

      const userId = String(sms.userId);
      const groupId = userGroupMap[userId];

      if (!groupId) continue; // Skip users without groups

      if (!timeData[timeKey]) {
        timeData[timeKey] = {};
      }

      if (!timeData[timeKey][groupId]) {
        timeData[timeKey][groupId] = {
          commission: 0,
          deals: 0,
          loginSeconds: 0,
          smsSent: 0,
          smsDelivered: 0,
          userIds: new Set()
        };
      }

      timeData[timeKey][groupId].smsSent += sms.count || 1;
      if (sms.status === 'delivered') {
        timeData[timeKey][groupId].smsDelivered += sms.count || 1;
      }
      timeData[timeKey][groupId].userIds.add(userId);
    }

    // Add login time data for each time period (sum all users in group)
    const sortedTimes = Object.keys(timeData).sort();
    console.log(`⏱️  [${leaderboard.name}] Processing ${sortedTimes.length} time periods for login time data...`);

    // OPTIMIZED: Fetch all login times in parallel instead of sequentially
    for (const timeKey of sortedTimes) {
      const periodStart = new Date(timeKey);
      const periodEnd = new Date(timeKey);

      if (groupByDay) {
        periodEnd.setDate(periodEnd.getDate() + 1);
      } else {
        periodEnd.setHours(periodEnd.getHours() + 1);
      }

      // Collect all login time promises for this time period
      const loginTimePromises = [];
      const groupUserMapping = []; // Track which group each promise belongs to

      for (const groupId in timeData[timeKey]) {
        for (const userId of timeData[timeKey][groupId].userIds) {
          loginTimePromises.push(loginTimeCache.getLoginTime(userId, periodStart, periodEnd));
          groupUserMapping.push({ groupId, userId });
        }
      }

      // Execute all login time fetches in parallel
      console.log(`   🔄 Fetching login time for ${loginTimePromises.length} users in period ${timeKey.split('T')[0]}...`);
      console.log(`   📅 Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);
      const loginTimeResults = await Promise.all(loginTimePromises);

      // Debug: Log first result
      if (loginTimeResults.length > 0 && loginTimeResults[0]) {
        console.log(`   🔍 Sample login time result:`, {
          userId: groupUserMapping[0].userId,
          loginSeconds: loginTimeResults[0].loginSeconds,
          fromDate: loginTimeResults[0].fromDate,
          toDate: loginTimeResults[0].toDate
        });
      }

      // Sum up login times per group
      const groupLoginTimes = {};
      loginTimeResults.forEach((loginTime, index) => {
        const { groupId } = groupUserMapping[index];
        if (!groupLoginTimes[groupId]) {
          groupLoginTimes[groupId] = 0;
        }
        groupLoginTimes[groupId] += loginTime?.loginSeconds || 0;
      });

      // Assign to timeData
      for (const groupId in timeData[timeKey]) {
        timeData[timeKey][groupId].loginSeconds = groupLoginTimes[groupId] || 0;
        // Convert Set to Array for serialization
        timeData[timeKey][groupId].userIds = Array.from(timeData[timeKey][groupId].userIds);
      }
    }

    console.log(`✅ [${leaderboard.name}] Login time data processing complete`);

    // Helper function to calculate metric value for a PERIOD (per-day, not cumulative)
    const calculatePeriodMetricValue = (metricName, periodStats) => {
      switch (metricName) {
        case 'deals':
          return periodStats.deals || 0;
        case 'sms_rate':
          return periodStats.smsSent > 0
            ? Math.round((periodStats.smsDelivered / periodStats.smsSent) * 100)
            : 0;
        case 'order_per_hour':
          return periodStats.loginSeconds > 0
            ? parseFloat(loginTimeCache.calculateDealsPerHour(periodStats.deals, periodStats.loginSeconds))
            : 0;
        case 'commission_per_hour':
          return periodStats.loginSeconds > 0
            ? Math.round((periodStats.commission / periodStats.loginSeconds) * 3600)
            : 0;
        default: // commission
          return Math.round(periodStats.commission || 0);
      }
    };

    // Build time series with PER-DAY values (not cumulative)
    const timeSeries = sortedTimes.map(timeKey => {
      const periodData = timeData[timeKey];

      // Build data point with support for multiple metrics
      const dataPoint = { time: timeKey };

      // For each group, calculate metrics for THIS PERIOD ONLY
      for (const groupId in periodData) {
        const groupName = groupNames[groupId] || `Group ${groupId}`;
        const periodStats = periodData[groupId];

        // Debug logging for first period
        if (timeKey === sortedTimes[0]) {
          console.log(`📊 [${groupName}] Period ${timeKey.split('T')[0]}:`);
          console.log(`   Deals: ${periodStats.deals}`);
          console.log(`   Login seconds: ${periodStats.loginSeconds} (${(periodStats.loginSeconds / 3600).toFixed(2)} hours)`);
          if (periodStats.loginSeconds > 0) {
            console.log(`   Order/hour: ${loginTimeCache.calculateDealsPerHour(periodStats.deals, periodStats.loginSeconds)}`);
          }
        }

        // Add values for each metric
        for (const metricConfig of metricsToFetch) {
          const metricName = metricConfig.metric;
          const value = calculatePeriodMetricValue(metricName, periodStats);

          // Use naming convention: "GroupName_metric" for multiple metrics
          const dataKey = metricsToFetch.length > 1
            ? `${groupName}_${metricName}`
            : groupName;

          dataPoint[dataKey] = value;
        }
      }

      return dataPoint;
    });

    // Calculate CUMULATIVE totals for the footer display (total for whole period)
    const groupTotals = {};
    for (const groupId in groupNames) {
      groupTotals[groupId] = {
        totalCommission: 0,
        totalDeals: 0,
        totalLoginSeconds: 0,
        totalSmsSent: 0,
        totalSmsDelivered: 0
      };
    }

    // Sum up all periods
    for (const timeKey of sortedTimes) {
      const periodData = timeData[timeKey];
      for (const groupId in periodData) {
        if (groupTotals[groupId]) {
          groupTotals[groupId].totalCommission += periodData[groupId].commission;
          groupTotals[groupId].totalDeals += periodData[groupId].deals;
          groupTotals[groupId].totalLoginSeconds += periodData[groupId].loginSeconds;
          groupTotals[groupId].totalSmsSent += periodData[groupId].smsSent;
          groupTotals[groupId].totalSmsDelivered += periodData[groupId].smsDelivered;
        }
      }
    }

    // Helper function for cumulative totals (used in footer)
    const calculateCumulativeMetricValue = (metricName, totals) => {
      switch (metricName) {
        case 'deals':
          return totals.totalDeals;
        case 'sms_rate':
          return totals.totalSmsSent > 0
            ? Math.round((totals.totalSmsDelivered / totals.totalSmsSent) * 100)
            : 0;
        case 'order_per_hour':
          return totals.totalLoginSeconds > 0
            ? parseFloat(loginTimeCache.calculateDealsPerHour(totals.totalDeals, totals.totalLoginSeconds))
            : 0;
        case 'commission_per_hour':
          return totals.totalLoginSeconds > 0
            ? Math.round((totals.totalCommission / totals.totalLoginSeconds) * 3600)
            : 0;
        default: // commission
          return Math.round(totals.totalCommission);
      }
    };

    // Get all groups with cumulative values for the primary metric (used for footer sorting/display)
    const primaryMetric = metricsToFetch[0].metric;
    const allGroups = Object.entries(groupTotals)
      .map(([groupId, totals]) => {
        const groupName = groupNames[groupId] || `Group ${groupId}`;
        const total = calculateCumulativeMetricValue(primaryMetric, totals);
        return { groupId, name: groupName, total };
      })
      .sort((a, b) => b.total - a.total);

    // No filtering - show all groups in time series
    const filteredTimeSeries = timeSeries;

    res.json({
      leaderboard: {
        id: leaderboard.id,
        name: leaderboard.name
      },
      timeSeries: filteredTimeSeries,
      topUsers: allGroups, // Changed from individual users to user groups
      groupBy: 'user_group', // Indicate that data is grouped by user group
      metrics: metricsToFetch, // Array of metric configs with axis info
      metric: primaryMetric, // For backward compatibility
      groupedBy: groupByDay ? 'day' : 'hour',
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

// Get recent SMS for notifications
router.get('/:id/recent-sms', async (req, res) => {
  try {
    const leaderboardId = req.params.id;
    const { minutes = 2 } = req.query;

    // Get leaderboard config
    const leaderboard = await leaderboardService.getLeaderboard(leaderboardId);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Calculate date range (last N minutes)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - parseInt(minutes));

    // Get SMS from cache
    const cachedSMS = await smsCache.getSMSInRange(startDate, endDate);

    // Get users for name mapping
    let adversusUsers = [];
    // Use cached users with fallback to API if not initialized
    adversusUsers = await userCache.getUsers({ adversusAPI });

    // Filter by user groups if specified
    let filteredSMS = cachedSMS;
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      const normalizedGroups = leaderboard.userGroups.map(g => String(g));
      const allowedUserIds = adversusUsers
        .filter(u => u.group && u.group.id && normalizedGroups.includes(String(u.group.id)))
        .map(u => String(u.id));

      filteredSMS = cachedSMS.filter(sms =>
        allowedUserIds.includes(String(sms.userId))
      );
    }

    // Add user names
    const smsWithNames = filteredSMS.map(sms => {
      const user = adversusUsers.find(u => String(u.id) === String(sms.userId));
      return {
        ...sms,
        userName: user?.name || user?.firstname || `Agent ${sms.userId}`
      };
    });

    // Sort by timestamp (newest first)
    smsWithNames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(smsWithNames);
  } catch (error) {
    console.error('❌ Error fetching recent SMS:', error);
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

// ==================== METRICS GRID - GROUP COMPARISON ====================

// Get aggregated metrics by user groups
router.get('/:id/group-metrics', async (req, res) => {
  try {
    const leaderboardId = req.params.id;

    // Get leaderboard config
    const leaderboard = await leaderboardService.getLeaderboard(leaderboardId);
    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    // Validate it's a metrics-grid type
    if (leaderboard.type !== 'metrics-grid') {
      return res.status(400).json({ error: 'This endpoint is only for metrics-grid leaderboards' });
    }

    // Validate configuration
    if (!leaderboard.selectedGroups || leaderboard.selectedGroups.length === 0) {
      return res.status(400).json({ error: 'No groups selected for this metrics-grid leaderboard' });
    }

    if (!leaderboard.metrics || leaderboard.metrics.length === 0) {
      return res.status(400).json({ error: 'No metrics configured for this metrics-grid leaderboard' });
    }

    console.log(`📊 [Metrics Grid: ${leaderboard.name}] Aggregating data for groups: ${leaderboard.selectedGroups.join(', ')}`);

    // Get Adversus users and groups
    let adversusUsers = [];
    let adversusGroups = [];

    // Use cached users with fallback to API if not initialized
    adversusUsers = await userCache.getUsers({ adversusAPI });

    try {
      const groupsResult = await adversusAPI.getUserGroups();
      adversusGroups = groupsResult.groups || [];
    } catch (error) {
      console.error('⚠️ Failed to load Adversus groups:', error.message);
      return res.status(500).json({ error: 'Failed to load Adversus data' });
    }

    // Build group metrics for each selected group
    const groupMetrics = [];

    // Log available groups for debugging
    console.log(`\n📋 Available groups (${adversusGroups.length} total):`);
    adversusGroups.forEach(g => {
      console.log(`   - ID: ${g.id} (type: ${typeof g.id}), Name: "${g.name}"`);
    });

    for (const groupId of leaderboard.selectedGroups) {
      console.log(`\n🔍 Looking for group ID: ${groupId} (type: ${typeof groupId})`);

      // Try to find group in adversusGroups first
      let group = adversusGroups.find(g => String(g.id) === String(groupId));

      // Get all users in this group
      const usersInGroup = adversusUsers.filter(u => String(u.group?.id) === String(groupId));
      const userIds = usersInGroup.map(u => String(u.id));

      // FALLBACK: If group not found in adversusGroups, try to get name from users in group
      let groupName = group?.name;
      if (!groupName && usersInGroup.length > 0 && usersInGroup[0].group?.name) {
        groupName = usersInGroup[0].group.name;
        console.log(`   ℹ️ Group not in adversusGroups, but found name from user: "${groupName}"`);
      }

      // Final fallback
      if (!groupName) {
        groupName = `Group ${groupId}`;
        console.warn(`⚠️ Could not find group name for ID ${groupId}! Using fallback.`);
      }

      console.log(`📊 Processing group: ${groupName} (ID: ${groupId})`);

      console.log(`   👥 Found ${usersInGroup.length} users in group`);

      // Initialize metrics object for this group
      const metrics = {
        groupId,
        groupName,
        metrics: {}
      };

      // Calculate each metric
      for (const metricConfig of leaderboard.metrics) {
        const { id, label, timePeriod, metric } = metricConfig;

        console.log(`   📈 Calculating: ${label} (${metric}, ${timePeriod})`);

        // Calculate date range for this metric
        const { startDate, endDate } = leaderboardService.getDateRange({ timePeriod });

        // NOTE: Central sync scheduler handles all cache updates every 3 minutes
        // This endpoint just reads from cache (no sync calls to avoid rate limiting)

        // Get deals for this group in date range
        const allDeals = await dealsCache.getDealsInRange(startDate, endDate);
        const groupDeals = allDeals.filter(deal => userIds.includes(String(deal.userId)));

        // Get SMS for this group in date range
        const allSMS = await smsCache.getSMSInRange(startDate, endDate);
        const groupSMS = allSMS.filter(sms => userIds.includes(String(sms.userId)));

        // Calculate metric value
        let value = 0;

        switch (metric) {
          case 'ordersPerHour':
          case 'order_per_hour':
          case 'dealsPerHour': {
            const totalDeals = groupDeals.reduce((sum, d) => sum + (d.multiDeals || 1), 0);
            let totalLoginSeconds = 0;

            for (const userId of userIds) {
              const loginTime = await loginTimeCache.getLoginTime(userId, startDate, endDate);
              totalLoginSeconds += loginTime?.loginSeconds || 0;
            }

            const loginHours = totalLoginSeconds / 3600;
            value = loginHours > 0 ? (totalDeals / loginHours) : 0;
            value = Math.round(value * 100) / 100; // Round to 2 decimals
            break;
          }

          case 'orders':
          case 'deals': {
            value = groupDeals.reduce((sum, d) => sum + (d.multiDeals || 1), 0);
            break;
          }

          case 'sms_success_rate':
          case 'smsSuccessRate': {
            // Get unique receivers (successful SMS)
            const uniqueReceivers = new Set(groupSMS.map(sms => sms.receiver));
            const uniqueSMS = uniqueReceivers.size;
            const totalDeals = groupDeals.length;

            value = totalDeals > 0 ? Math.round((totalDeals / uniqueSMS) * 100) : 0;
            // Store uniqueSMS as additional data for display
            metrics.metrics[id] = {
              label,
              value,
              timePeriod,
              metric,
              additionalData: { uniqueSMS }
            };
            console.log(`   ✅ ${label}: ${value}% (${uniqueSMS} SMS)`);
            continue; // Skip the generic assignment below
          }

          case 'sms_unique':
          case 'uniqueSMS': {
            const uniqueReceivers = new Set(groupSMS.map(sms => sms.receiver));
            value = uniqueReceivers.size;
            break;
          }

          case 'commission':
          case 'totalCommission': {
            value = groupDeals.reduce((sum, d) => sum + parseFloat(d.commission || 0), 0);
            value = Math.round(value);
            break;
          }

          default:
            console.warn(`   ⚠️ Unknown metric type: ${metric}`);
            value = 0;
        }

        // VALIDATION: Ensure value is a valid number
        if (typeof value !== 'number' || isNaN(value)) {
          console.error(`   ❌ INVALID VALUE for ${label}: ${typeof value} = ${JSON.stringify(value)}`);
          value = 0; // Fallback to 0 for safety
        }

        metrics.metrics[id] = {
          label,
          value,
          timePeriod,
          metric
        };

        console.log(`   ✅ ${label}: ${value} (type: ${typeof value})`);
      }

      // VALIDATION: Final check before pushing
      console.log(`\n🔍 Final metrics for ${groupName}:`, JSON.stringify(metrics, null, 2));

      // Deep clone to prevent mutation
      groupMetrics.push(JSON.parse(JSON.stringify(metrics)));
    }

    console.log(`\n✅ Completed metrics grid calculation for ${groupMetrics.length} groups`);

    res.json({
      leaderboard,
      groupMetrics,
      calculatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error calculating group metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
