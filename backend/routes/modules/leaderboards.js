const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const database = require('../../services/database');
const leaderboardService = require('../../services/leaderboards');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const leaderboardCache = require('../../services/leaderboardCache');
const bonusTiers = require('../../services/bonusTiers');

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

    // Build complete stats array with SMS and bonus tier data
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

        // Calculate bonus tier
        const bonusTierInfo = bonusTiers.calculateTierForCommission(stat.totalCommission || 0);

        return {
          userId: stat.userId,
          dealCount: stat.dealCount || 0,
          totalCommission: stat.totalCommission || 0,
          uniqueSMS: smsData.uniqueSMS || 0,
          smsSuccessRate: smsData.successRate || 0,
          bonusTier: {
            name: bonusTierInfo.name,
            threshold: bonusTierInfo.threshold,
            bonus: bonusTierInfo.bonus,
            color: bonusTierInfo.color,
            icon: bonusTierInfo.icon,
            nextTier: bonusTierInfo.nextTier ? bonusTierInfo.nextTier.name : null,
            progressToNext: bonusTierInfo.progressToNext,
            remainingToNext: bonusTierInfo.remainingToNext
          },
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
