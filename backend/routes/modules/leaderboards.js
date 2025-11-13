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

    // DEBUG: Log deals per user from cache (before filtering)
    const rawDealsByUser = {};
    cachedDeals.forEach(deal => {
      const userId = String(deal.userId);
      if (!rawDealsByUser[userId]) rawDealsByUser[userId] = 0;
      rawDealsByUser[userId] += parseInt(deal.multiDeals || '1');
    });
    console.log(`   📋 Raw cache data: ${Object.keys(rawDealsByUser).length} users with deals (BEFORE any filtering)`);
    Object.entries(rawDealsByUser).slice(0, 5).forEach(([userId, count]) => {
      console.log(`      User ${userId}: ${count} deals (raw from cache)`);
    });

    // Convert cached deals to lead format
    const leads = cachedDeals.map(deal => {
      // CRITICAL: Ensure multiDeals is always a number, never a string
      let multiDeals = parseInt(deal.multiDeals);
      if (isNaN(multiDeals) || multiDeals < 1) {
        console.error(`❌ CRITICAL: Invalid multiDeals in cache for lead ${deal.leadId}: ${typeof deal.multiDeals} = "${deal.multiDeals}"`);
        multiDeals = 1; // Fallback
      }

      return {
        id: deal.leadId,
        lastContactedBy: deal.userId,
        campaignId: deal.campaignId,
        status: deal.status,
        lastUpdatedTime: deal.orderDate,
        resultData: [
          { id: 70163, value: String(deal.commission) },
          { id: 74126, value: multiDeals }, // Always a number now
          { label: 'Order date', value: deal.orderDate }
        ]
      };
    });

    console.log(`✅ Loaded ${leads.length} deals from cache`);

    // Get users and agents
    let adversusUsers = [];
    let localAgents = [];

    // Use cached users with fallback to API if not initialized
    adversusUsers = await userCache.getUsers({ adversusAPI });

    // CRITICAL: If user cache is empty, ALL filtering will fail → 0 deals!
    // This is why klassiska tabellen shows 0 deals after leaderboardCache.clear()
    if (adversusUsers.length === 0) {
      console.error('🚨 CRITICAL: User cache is EMPTY in /stats endpoint!');
      console.error('   This causes 0 deals in klassiska tabellen after new deal popup.');
      console.error('   Attempting direct API call as emergency fallback...');

      try {
        const result = await adversusAPI.getUsers();
        adversusUsers = result.users || [];
        console.log(`✅ Emergency fallback: Got ${adversusUsers.length} users from API`);
        userCache.update(adversusUsers);
      } catch (error) {
        console.error('❌ Emergency fallback failed:', error.message);
        // Continue with empty array - will show no filtered data
      }
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

    // DEBUG: Log deals that will be processed
    const dealsByUser = {};
    filteredLeads.forEach(lead => {
      const userId = String(lead.lastContactedBy);
      if (!dealsByUser[userId]) dealsByUser[userId] = 0;
      const multiDeals = parseInt(lead.resultData?.find(f => f.id === 74126)?.value || '1');
      dealsByUser[userId] += multiDeals;
    });
    console.log(`📊 Deals per user after filtering: ${Object.keys(dealsByUser).length} users with deals`);
    Object.entries(dealsByUser).slice(0, 5).forEach(([userId, count]) => {
      const user = adversusUsers.find(u => String(u.id) === userId);
      console.log(`   User ${userId} (${user?.name || 'UNKNOWN'}): ${count} deals`);
    });

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
      const rawMultiDeals = multiDealsField?.value;
      const multiDealsValue = parseInt(rawMultiDeals || '1');

      // DEBUG: Log if multiDeals parsing fails or produces unexpected value
      if (isNaN(multiDealsValue)) {
        console.error(`❌ CRITICAL: multiDeals is NaN for lead ${lead.id}, user ${userId}`);
        console.error(`   Raw value: ${typeof rawMultiDeals} = "${rawMultiDeals}"`);
        console.error(`   Parsed value: ${multiDealsValue}`);
      } else if (multiDealsValue === 0) {
        console.warn(`⚠️  WARNING: multiDeals is 0 for lead ${lead.id}, user ${userId}`);
        console.warn(`   Raw value: ${typeof rawMultiDeals} = "${rawMultiDeals}"`);
      } else if (typeof rawMultiDeals === 'string' && rawMultiDeals.length > 3) {
        console.warn(`⚠️  WARNING: multiDeals is long string for lead ${lead.id}, user ${userId}`);
        console.warn(`   Raw value: ${typeof rawMultiDeals} = "${rawMultiDeals}"`);
        console.warn(`   Parsed to: ${multiDealsValue}`);
      }

      stats[userId].totalCommission += commission;
      stats[userId].dealCount += multiDealsValue;
    });

    // DEBUG: Log final stats for users with deals
    const usersWithDeals = Object.values(stats).filter(s => s.dealCount > 0);
    const usersWithZeroDeals = Object.values(stats).filter(s => s.dealCount === 0);
    console.log(`📊 FINAL STATS: ${usersWithDeals.length} users with deals, ${usersWithZeroDeals.length} users with 0 deals`);

    // Log first 5 users with deals
    usersWithDeals.slice(0, 5).forEach(s => {
      const user = adversusUsers.find(u => String(u.id) === String(s.userId));
      console.log(`   ✅ User ${s.userId} (${user?.name || 'UNKNOWN'}): ${s.dealCount} deals, ${Math.round(s.totalCommission)} THB`);
    });

    // Log users with 0 deals (WARNING - these will show 0 in klassiska tabellen!)
    if (usersWithZeroDeals.length > 0 && usersWithZeroDeals.length <= 10) {
      console.log(`⚠️  Users with 0 deals (will show 0 in klassiska tabellen):`);
      usersWithZeroDeals.forEach(s => {
        const user = adversusUsers.find(u => String(u.id) === String(s.userId));
        console.log(`   ❌ User ${s.userId} (${user?.name || 'UNKNOWN'}): 0 deals`);
      });
    }

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
          // Get cached login time with API fallback for today's data
          let loginTime = await loginTimeCache.getLoginTime(stat.userId, startDate, endDate, adversusAPI);

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
    // PRIORITY: Use leaderboard's timePeriod setting if it exists (respects calendar months/weeks)
    // FALLBACK: Use days/hours parameters for backward compatibility
    let startDate, endDate, groupByDay;

    if (leaderboard.timePeriod) {
      // Use leaderboard's configured time period (e.g., 'month', 'week', 'day', 'custom')
      const dateRange = leaderboardService.getDateRange(leaderboard);
      startDate = dateRange.startDate;
      endDate = dateRange.endDate;
      groupByDay = leaderboard.timePeriod !== 'day'; // Group by day unless it's a single day view
      console.log(`📅 Using leaderboard timePeriod: ${leaderboard.timePeriod}`);
    } else {
      // Fallback to days/hours parameters
      endDate = new Date();
      startDate = new Date();
      if (days) {
        startDate.setDate(startDate.getDate() - parseInt(days));
        groupByDay = true;
      } else {
        startDate.setHours(startDate.getHours() - parseInt(hours || 24));
        groupByDay = false;
      }
      console.log(`📅 Using days/hours parameter: ${days || hours}`);
    }

    console.log(`📈 [${leaderboard.name}] Fetching history from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   📊 Grouping by: ${groupByDay ? 'DAY' : 'HOUR'}, Metrics: ${metrics || metric}`);
    console.log(`   👥 User Groups filter: ${leaderboard.userGroups && leaderboard.userGroups.length > 0 ? leaderboard.userGroups.join(', ') : 'ALLA (tomt filter)'}`);
    console.log(`   ⏰ Current time: ${new Date().toISOString()}`);

    // Get data from caches
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);
    const cachedSMS = await smsCache.getSMSInRange(startDate, endDate);

    console.log(`   📦 Raw cache results: ${cachedDeals.length} deals, ${cachedSMS.length} SMS`);

    // Get users
    let adversusUsers = [];
    // Use cached users with fallback to API if not initialized
    adversusUsers = await userCache.getUsers({ adversusAPI });

    // CRITICAL: If user cache is empty, filtering will return 0 deals!
    if (adversusUsers.length === 0) {
      console.error('🚨 CRITICAL: User cache is EMPTY in /history endpoint!');
      console.error('   Attempting direct API call as emergency fallback...');

      try {
        const result = await adversusAPI.getUsers();
        adversusUsers = result.users || [];
        console.log(`✅ Emergency fallback: Got ${adversusUsers.length} users from API`);
        userCache.update(adversusUsers);
      } catch (error) {
        console.error('❌ Emergency fallback failed:', error.message);
        // Continue with empty array - will show no filtered data
      }
    }

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

    // Build a map of groupId -> all userIds in that group (for correct login time calculation)
    const groupUsersMap = {}; // groupId -> Set of all userIds in group
    for (const userId in userGroupMap) {
      const groupId = userGroupMap[userId];
      if (!groupUsersMap[groupId]) {
        groupUsersMap[groupId] = new Set();
      }
      groupUsersMap[groupId].add(userId);
    }

    console.log(`   👥 Users per group:`, Object.keys(groupUsersMap).map(gid =>
      `${groupNames[gid]}: ${groupUsersMap[gid].size} users`
    ).join(', '));

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
          userIds: new Set(groupUsersMap[groupId]) // Initialize with ALL users in group
        };
      }

      timeData[timeKey][groupId].commission += parseFloat(deal.commission || 0);
      timeData[timeKey][groupId].deals += parseInt(deal.multiDeals || '1');
      // Don't need to add userId here anymore - already included from groupUsersMap
    }

    // DEBUG: Log today's deal counts per group
    const today = new Date();
    const todayKey = groupByDay
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      : null;

    if (todayKey && timeData[todayKey]) {
      console.log(`🔍 TODAY'S DEALS (${todayKey.split('T')[0]}):`);
      for (const groupId in timeData[todayKey]) {
        const groupName = groupNames[groupId] || `Group ${groupId}`;
        const deals = timeData[todayKey][groupId].deals;
        console.log(`   ${groupName}: ${deals} deals`);
      }
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
          userIds: new Set(groupUsersMap[groupId]) // Initialize with ALL users in group
        };
      }

      timeData[timeKey][groupId].smsSent += sms.count || 1;
      if (sms.status === 'delivered') {
        timeData[timeKey][groupId].smsDelivered += sms.count || 1;
      }
      // Don't need to add userId here anymore - already included from groupUsersMap
    }

    // Ensure all time periods exist for all groups (even if no deals/SMS)
    // This is needed to fetch login time for groups with no activity
    const allTimeKeys = new Set(Object.keys(timeData));

    // Generate all time keys in the date range
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      let timeKey;
      if (groupByDay) {
        timeKey = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).toISOString();
        currentDate.setDate(currentDate.getDate() + 1);
      } else {
        timeKey = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), currentDate.getHours()).toISOString();
        currentDate.setHours(currentDate.getHours() + 1);
      }
      allTimeKeys.add(timeKey);
    }

    // Initialize all time periods for all groups
    for (const timeKey of allTimeKeys) {
      if (!timeData[timeKey]) {
        timeData[timeKey] = {};
      }
      for (const groupId in groupUsersMap) {
        if (!timeData[timeKey][groupId]) {
          timeData[timeKey][groupId] = {
            commission: 0,
            deals: 0,
            loginSeconds: 0,
            smsSent: 0,
            smsDelivered: 0,
            userIds: new Set(groupUsersMap[groupId]) // ALL users in group
          };
        }
      }
    }

    // Add login time data for each time period (sum all users in group)
    const sortedTimes = Object.keys(timeData).sort();
    console.log(`⏱️  [${leaderboard.name}] Processing ${sortedTimes.length} time periods for login time data...`);

    // SUPER OPTIMIZED: Sync login time ONCE for ENTIRE period for all users
    // This reduces API calls from N (one per day) to 1-2 (historical + today)
    // Example: 13 days = 13 API calls → 1-2 API calls (massive rate limit reduction!)

    // Step 1: Collect ALL unique users across ALL time periods
    const allUniqueUserIds = new Set();
    for (const timeKey of sortedTimes) {
      for (const groupId in timeData[timeKey]) {
        for (const userId of timeData[timeKey][groupId].userIds) {
          allUniqueUserIds.add(userId);
        }
      }
    }

    const allUsersArray = Array.from(allUniqueUserIds);
    console.log(`   👥 Total unique users across all periods: ${allUsersArray.length}`);

    // Step 2: Sync login time PER DAY (not entire range) to get accurate daily values
    // This prevents incorrect daily averages for historical data
    console.log(`   🔄 Syncing login time PER DAY for ${allUsersArray.length} users...`);
    console.log(`   📅 Full range: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);

    try {
      // Determine which days need syncing
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

      const currentDate = new Date(startDate);
      const daysToSync = [];
      const cachedDays = [];

      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setUTCHours(23, 59, 59, 999);
        const dateStr = dayStart.toISOString().split('T')[0];

        // Always sync today (data changes frequently)
        // For historical days, check if we have data in DB
        const isToday = dayStart >= todayStart;

        if (isToday) {
          daysToSync.push({ dayStart, dayEnd, dateStr, reason: 'today' });
        } else {
          // Check if any user is missing data for this day
          let missingData = false;
          for (const userId of allUsersArray) {
            const loginTime = await loginTimeCache.getLoginTime(userId, dayStart, dayEnd);
            if (!loginTime || loginTime.loginSeconds === 0 || loginTime.isAverage) {
              missingData = true;
              break;
            }
          }

          if (missingData) {
            daysToSync.push({ dayStart, dayEnd, dateStr, reason: 'missing' });
          } else {
            cachedDays.push(dateStr);
          }
        }

        // Move to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      console.log(`   ✅ Found ${cachedDays.length} days already cached, need to sync ${daysToSync.length} days`);

      // Sync only the days that need it
      for (const { dayStart, dayEnd, dateStr, reason } of daysToSync) {
        console.log(`   📅 Syncing day: ${dateStr} (reason: ${reason})`);
        await loginTimeCache.syncLoginTimeForUsers(adversusAPI, allUsersArray, dayStart, dayEnd);
      }

      console.log(`   ✅ Synced ${daysToSync.length} days, ${cachedDays.length} days used cached data`);
    } catch (error) {
      console.error(`   ❌ Failed to sync login time per day:`, error.message);
    }

    // Step 3: For each time period, read cached data and calculate per-period login time
    for (const timeKey of sortedTimes) {
      const periodStart = new Date(timeKey);
      const periodEnd = new Date(timeKey);

      if (groupByDay) {
        // CRITICAL FIX: Use 23:59:59 instead of 00:00:00 next day
        // This matches how central sync saves login time (00:00 - 23:59)
        // Old: periodEnd = 2025-11-14 00:00:00 (no match)
        // New: periodEnd = 2025-11-13 23:59:59.999 (exact match!)
        periodEnd.setUTCHours(23, 59, 59, 999);
      } else {
        periodEnd.setHours(periodEnd.getHours() + 1);
      }

      // DEBUG: Log the period being queried
      const isPotentiallyToday = timeKey.split('T')[0] === new Date().toISOString().split('T')[0];
      if (isPotentiallyToday) {
        console.log(`   🔍 Querying TODAY's login time: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);
      }

      // Collect user-group mapping for this period
      const groupUserMapping = [];
      for (const groupId in timeData[timeKey]) {
        for (const userId of timeData[timeKey][groupId].userIds) {
          groupUserMapping.push({ groupId, userId });
        }
      }

      // Read from cache for each user with API fallback for today's data
      const loginTimeResults = await Promise.all(
        groupUserMapping.map(({ userId }) => loginTimeCache.getLoginTime(userId, periodStart, periodEnd, adversusAPI))
      );

      // Sum up login times per group for this period
      const groupLoginTimes = {};
      loginTimeResults.forEach((loginTime, index) => {
        const { groupId, userId } = groupUserMapping[index];
        if (!groupLoginTimes[groupId]) {
          groupLoginTimes[groupId] = 0;
        }
        groupLoginTimes[groupId] += loginTime?.loginSeconds || 0;

        // DEBUG: Log each user's login time for today
        if (isPotentiallyToday) {
          const groupName = groupNames[groupId];
          console.log(`      👤 User ${userId} (${groupName}): ${loginTime?.loginSeconds || 0}s login time`);
        }
      });

      // Assign to timeData
      for (const groupId in timeData[timeKey]) {
        timeData[timeKey][groupId].loginSeconds = groupLoginTimes[groupId] || 0;
        // Convert Set to Array for serialization
        timeData[timeKey][groupId].userIds = Array.from(timeData[timeKey][groupId].userIds);

        // DEBUG: Log total login seconds per group for today
        if (isPotentiallyToday) {
          const groupName = groupNames[groupId];
          const totalSeconds = groupLoginTimes[groupId] || 0;
          const deals = timeData[timeKey][groupId].deals;
          console.log(`      🏢 ${groupName}: ${totalSeconds}s total (${(totalSeconds/3600).toFixed(2)}h) for ${deals} deals`);
        }
      }

      console.log(`   ✅ Period ${timeKey.split('T')[0]}: Loaded login time from cache`);

      // Debug: Log calculated values for this period
      for (const groupId in timeData[timeKey]) {
        const groupData = timeData[timeKey][groupId];
        const groupName = groupNames[groupId] || `Group ${groupId}`;
        console.log(`      📊 ${groupName}: ${groupData.deals} deals, ${(groupData.loginSeconds / 3600).toFixed(2)}h login, ${groupData.commission.toFixed(2)} THB`);
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
          const orderPerHour = periodStats.loginSeconds > 0
            ? parseFloat(loginTimeCache.calculateDealsPerHour(periodStats.deals, periodStats.loginSeconds))
            : 0;
          return orderPerHour;
        case 'commission_per_hour':
          const commissionPerHour = periodStats.loginSeconds > 0
            ? Math.round((periodStats.commission / periodStats.loginSeconds) * 3600)
            : 0;
          return commissionPerHour;
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

        // Debug logging for first period AND today AND "Dentle" groups
        const isFirstPeriod = timeKey === sortedTimes[0];
        const isLastPeriod = timeKey === sortedTimes[sortedTimes.length - 1];
        const isDentleGroup = groupName.toLowerCase().includes('dentle');

        if (isFirstPeriod || isLastPeriod || isDentleGroup) {
          const dateStr = timeKey.split('T')[0];
          const label = isLastPeriod ? '🔴 LAST/TODAY' : isFirstPeriod ? '🟢 FIRST' : '🟡 DENTLE';
          console.log(`${label} [${groupName}] Period ${dateStr}:`);
          console.log(`   Deals: ${periodStats.deals}`);
          console.log(`   Login seconds: ${periodStats.loginSeconds} (${(periodStats.loginSeconds / 3600).toFixed(2)} hours)`);
          if (periodStats.loginSeconds > 0) {
            console.log(`   Order/hour: ${loginTimeCache.calculateDealsPerHour(periodStats.deals, periodStats.loginSeconds)}`);
          } else if (periodStats.deals > 0) {
            console.log(`   ⚠️  WARNING: Has ${periodStats.deals} deals but 0 login seconds → order/h will be 0!`);
          }
        }

        // Add values for each metric
        for (const metricConfig of metricsToFetch) {
          const metricName = metricConfig.metric;

          // CRITICAL FIX: For order/h metrics, only show values when there are deals
          // If someone is logged in but has 0 deals, showing "0.00 order/h" is misleading
          // Better to show null (skip the point in chart) to indicate no activity
          let value;
          if (metricName === 'order_per_hour' || metricName === 'ordersPerHour' || metricName === 'dealsPerHour') {
            // For order/h: only show if there are deals
            if (periodStats.deals > 0) {
              value = calculatePeriodMetricValue(metricName, periodStats);
            } else {
              value = null; // No deals = no point to show in chart
            }
          } else {
            // For other metrics (commission, sms_rate, etc): always calculate
            value = calculatePeriodMetricValue(metricName, periodStats);
          }

          // Use naming convention: "GroupName_metric" for multiple metrics
          const dataKey = metricsToFetch.length > 1
            ? `${groupName}_${metricName}`
            : groupName;

          dataPoint[dataKey] = value;
        }
      }

      return dataPoint;
    });

    // Filter out time periods where ALL groups have zero activity (all values are null)
    // For order/h: day with no deals = all null values = should be filtered out
    const filteredTimeSeries = timeSeries.filter(dataPoint => {
      // Check if ANY value is non-null (at least one group has activity)
      const hasAnyData = Object.keys(dataPoint).some(key => {
        if (key === 'time') return false;
        return dataPoint[key] !== null && dataPoint[key] !== undefined;
      });

      // DEBUG: Log filtered periods
      if (!hasAnyData) {
        const dateStr = new Date(dataPoint.time).toISOString().split('T')[0];
        console.log(`   🗑️  Filtering out ${dateStr}: All groups have null values (no deals)`);
      }

      return hasAnyData;
    });

    console.log(`📊 Filtered time series: ${timeSeries.length} → ${filteredTimeSeries.length} periods (removed ${timeSeries.length - filteredTimeSeries.length} empty periods)`);

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

    // Note: filteredTimeSeries was created earlier (after building timeSeries)
    // It filters out days where ALL groups have zero activity

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
      timePeriod: leaderboard.timePeriod || null, // Include timePeriod so frontend can show correct label
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

    // CRITICAL: If user cache is empty, ALL filtering will fail → 0 deals!
    // This happens when server just started or central sync hasn't run yet
    if (adversusUsers.length === 0) {
      console.error('🚨 CRITICAL: User cache is EMPTY! All metrics will show 0 deals.');
      console.error('   Central sync has not run yet or failed.');
      console.error('   Attempting direct API call as emergency fallback...');

      try {
        const result = await adversusAPI.getUsers();
        adversusUsers = result.users || [];
        console.log(`✅ Emergency fallback: Got ${adversusUsers.length} users from API`);

        // Update cache for future requests
        userCache.update(adversusUsers);
      } catch (error) {
        console.error('❌ Emergency fallback to API also failed:', error.message);
        return res.status(500).json({
          error: 'User cache not initialized and API fallback failed',
          details: 'Central sync may not be running. Check server startup logs.'
        });
      }
    }

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

      // DEBUG: Log first few user IDs
      if (userIds.length > 0) {
        console.log(`   📋 Sample user IDs: ${userIds.slice(0, 5).join(', ')}${userIds.length > 5 ? '...' : ''}`);
      } else {
        console.error(`   🚨 WARNING: No users found in this group!`);
      }

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

        // DEBUG: Log filtering results
        console.log(`   📦 All deals: ${allDeals.length}, Group deals (after filter): ${groupDeals.length}`);
        if (allDeals.length > 0 && groupDeals.length === 0) {
          console.error(`   🚨 CRITICAL: ${allDeals.length} deals exist but 0 match group userIds!`);
          console.error(`   👥 Group userIds (${userIds.length}): ${userIds.slice(0, 10).join(', ')}${userIds.length > 10 ? '...' : ''}`);
          const sampleDeals = allDeals.slice(0, 5).map(d => `lead_id=${d.leadId}, user_id=${d.userId}`);
          console.error(`   📋 Sample deal data: ${sampleDeals.join(', ')}`);
          console.error(`   🔍 Type check: userIds[0] type=${typeof userIds[0]}, deals[0].userId type=${typeof allDeals[0]?.userId}`);
        } else if (allDeals.length === 0) {
          console.error(`   🚨 CRITICAL: dealsCache.getDealsInRange() returned 0 deals!`);
          console.error(`   📅 Query was for: ${startDate.toISOString()} → ${endDate.toISOString()}`);
        }

        // Get SMS for this group in date range
        const allSMS = await smsCache.getSMSInRange(startDate, endDate);
        const groupSMS = allSMS.filter(sms => userIds.includes(String(sms.userId)));

        // DEBUG: Log SMS filtering for comparison
        console.log(`   💬 All SMS: ${allSMS.length}, Group SMS (after filter): ${groupSMS.length}`);

        // Calculate metric value
        let value = 0;

        switch (metric) {
          case 'ordersPerHour':
          case 'order_per_hour':
          case 'dealsPerHour': {
            // CRITICAL FIX: Ensure multiDeals is parsed as integer
            const totalDeals = groupDeals.reduce((sum, d) => {
              const multiDeals = parseInt(d.multiDeals) || 1;
              return sum + multiDeals;
            }, 0);
            let totalLoginSeconds = 0;

            for (const userId of userIds) {
              const loginTime = await loginTimeCache.getLoginTime(userId, startDate, endDate, adversusAPI);
              totalLoginSeconds += loginTime?.loginSeconds || 0;
            }

            const loginHours = totalLoginSeconds / 3600;
            value = loginHours > 0 ? (totalDeals / loginHours) : 0;
            value = Math.round(value * 100) / 100; // Round to 2 decimals
            break;
          }

          case 'orders':
          case 'deals': {
            // CRITICAL FIX: Ensure multiDeals is parsed as integer
            // Prevents string concatenation if DB returns string
            value = groupDeals.reduce((sum, d) => {
              const multiDeals = parseInt(d.multiDeals) || 1;
              return sum + multiDeals;
            }, 0);
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
