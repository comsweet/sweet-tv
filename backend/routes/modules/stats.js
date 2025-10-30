const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const database = require('../../services/database');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');

// ==================== STATS ====================

// Get leaderboard stats for admin (date range)
router.get('/leaderboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    console.log(`📊 Fetching stats from ${start.toISOString()} to ${end.toISOString()}`);

    // AUTO-SYNC CACHES
    await dealsCache.autoSync(adversusAPI);
    await smsCache.autoSync(adversusAPI);

    // Get deals from cache
    const cachedDeals = await dealsCache.getDealsInRange(start, end);

    // Convert to lead format
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

    // Get users
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

    // Calculate stats
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

      const multiDealsField = lead.resultData?.find(f => f.id === 74126);
      const multiDealsValue = parseInt(multiDealsField?.value || '1');

      if (multiDealsValue > 1) {
        console.log(`  🎯 Lead ${lead.id}: multiDeals=${multiDealsValue}`);
      }

      stats[userId].totalCommission += commission;
      stats[userId].dealCount += multiDealsValue;
    });

    // Build complete stats array
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

    if (leaderboard.length > 0) {
      console.log('📊 Sample stat object:', JSON.stringify(leaderboard[0], null, 2));
    }

    res.json(leaderboard);
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
