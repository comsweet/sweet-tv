const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const database = require('../../services/database');
const leaderboardService = require('../../services/leaderboards');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const leaderboardCache = require('../../services/leaderboardCache');
const campaignCache = require('../../services/campaignCache');
const campaignBonusTiers = require('../../services/campaignBonusTiers');

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

    filteredLeads.forEach(lead => {
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

      const multiDealsField = lead.resultData?.find(f => f.id === 74126);
      const multiDealsValue = parseInt(multiDealsField?.value || '1');

      stats[userId].totalCommission += commission;
      stats[userId].dealCount += multiDealsValue;
    });

    // 🔥 ADD ALL AGENTS FROM SELECTED USER GROUPS (even with 0 deals)
    if (leaderboard.userGroups && leaderboard.userGroups.length > 0) {
      const normalizedGroups = leaderboard.userGroups.map(g => String(g));

      // Find all users in selected groups
      const usersInSelectedGroups = adversusUsers.filter(u => {
        if (!u.group || !u.group.id) return false;
        const userGroupId = String(u.group.id);
        return normalizedGroups.includes(userGroupId);
      });

      // Add any missing users with 0 deals
      usersInSelectedGroups.forEach(user => {
        const userId = String(user.id);
        if (!stats[userId]) {
          stats[userId] = {
            userId: userId,
            totalCommission: 0,
            dealCount: 0
          };
          console.log(`  ➕ Added agent ${user.name || userId} with 0 deals from group ${user.group.id}`);
        }
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

        return {
          userId: stat.userId,
          dealCount: stat.dealCount || 0,
          totalCommission: stat.totalCommission || 0,
          uniqueSMS: smsData.uniqueSMS || 0,
          smsSuccessRate: smsData.successRate || 0,
          campaignBonus: stat.campaignBonus || 0,
          campaignBonusDetails: stat.campaignBonusDetails || [],
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

    // Sort by commission DESC
    statsArray.sort((a, b) => b.totalCommission - a.totalCommission);

    const response = {
      leaderboard: leaderboard,
      stats: statsArray,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    };

    // Cache the result
    leaderboardCache.set(leaderboardId, startDate.toISOString(), endDate.toISOString(), response);

    console.log(`📈 Leaderboard "${leaderboard.name}" with ${statsArray.length} agents`);

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

module.exports = router;
