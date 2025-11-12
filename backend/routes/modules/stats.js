const express = require('express');
const router = express.Router();
const adversusAPI = require('../../services/adversusAPI');
const database = require('../../services/database');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const loginTimeCache = require('../../services/loginTimeCache');
const campaignCache = require('../../services/campaignCache');
const campaignBonusTiers = require('../../services/campaignBonusTiers');

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

    // IMPORTANT: Initialize stats for ALL users first (so users with 0 deals show up)
    adversusUsers.forEach(user => {
      stats[user.id] = {
        userId: user.id,
        totalCommission: 0,
        dealCount: 0
      };
    });

    // Then add deal data for users who have deals
    leads.forEach(lead => {
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

      if (multiDealsValue > 1) {
        console.log(`  🎯 Lead ${lead.id}: multiDeals=${multiDealsValue}`);
      }

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

      // Skip if not in stats
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
        campaignBonus: stat.campaignBonus || 0,
        campaignBonusDetails: stat.campaignBonusDetails || [],
        agent: {
          userId: stat.userId,
          name: agentName,
          email: adversusUser?.email || '',
          profileImage: localAgent?.profileImage || null,
          groupName: adversusUser?.group?.name || null
        }
      };
    })
    // Admin stats endpoint always sorts by total commission (default)
    // Individual leaderboards have configurable sorting
    .sort((a, b) => b.totalCommission - a.totalCommission);

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

// Get standalone trend chart history (not tied to leaderboard)
router.get('/history', async (req, res) => {
  try {
    const {
      days = 30,
      topN = 5,
      metric = 'commission',
      userGroups // comma-separated list of user group IDs
    } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const groupByDay = true; // Always group by day for standalone charts

    console.log(`📈 [Standalone] Fetching history from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   📊 Grouping by: DAY, Metric: ${metric}, TopN: ${topN}`);
    if (userGroups) {
      console.log(`   👥 User groups filter: ${userGroups}`);
    }

    // Get data from caches
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);
    const cachedSMS = await smsCache.getSMSInRange(startDate, endDate);

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
    let filteredSMS = cachedSMS;
    let allowedUserIds = [];

    if (userGroups && userGroups.trim() !== '') {
      const normalizedGroups = userGroups.split(',').map(g => String(g.trim()));
      allowedUserIds = adversusUsers
        .filter(u => u.group && u.group.id && normalizedGroups.includes(String(u.group.id)))
        .map(u => String(u.id));

      console.log(`   ✅ Filtered to ${allowedUserIds.length} users in groups: ${normalizedGroups.join(', ')}`);

      filteredDeals = cachedDeals.filter(deal =>
        allowedUserIds.includes(String(deal.userId))
      );
      filteredSMS = cachedSMS.filter(sms =>
        allowedUserIds.includes(String(sms.userId))
      );
    } else {
      allowedUserIds = adversusUsers.map(u => String(u.id));
    }

    // Group data by time period (day)
    const timeData = {};

    for (const deal of filteredDeals) {
      const dealDate = new Date(deal.orderDate);
      const timeKey = new Date(dealDate.getFullYear(), dealDate.getMonth(), dealDate.getDate()).toISOString();
      const userId = String(deal.userId);

      if (!timeData[timeKey]) {
        timeData[timeKey] = {};
      }

      if (!timeData[timeKey][userId]) {
        timeData[timeKey][userId] = {
          commission: 0,
          deals: 0,
          loginSeconds: 0,
          smsSent: 0,
          smsDelivered: 0
        };
      }

      timeData[timeKey][userId].commission += parseFloat(deal.commission || 0);
      timeData[timeKey][userId].deals += parseInt(deal.multiDeals || '1');
    }

    // Add SMS data
    for (const sms of filteredSMS) {
      const smsDate = new Date(sms.timestamp);
      const timeKey = new Date(smsDate.getFullYear(), smsDate.getMonth(), smsDate.getDate()).toISOString();
      const userId = String(sms.userId);

      if (!timeData[timeKey]) {
        timeData[timeKey] = {};
      }

      if (!timeData[timeKey][userId]) {
        timeData[timeKey][userId] = {
          commission: 0,
          deals: 0,
          loginSeconds: 0,
          smsSent: 0,
          smsDelivered: 0
        };
      }

      timeData[timeKey][userId].smsSent += sms.count || 1;
      if (sms.status === 'delivered') {
        timeData[timeKey][userId].smsDelivered += sms.count || 1;
      }
    }

    // Add login time data for each time period
    const sortedTimes = Object.keys(timeData).sort();

    for (const timeKey of sortedTimes) {
      const periodStart = new Date(timeKey);
      const periodEnd = new Date(timeKey);
      periodEnd.setDate(periodEnd.getDate() + 1);

      for (const userId of allowedUserIds) {
        if (timeData[timeKey][userId]) {
          const loginTime = await loginTimeCache.getLoginTime(userId, periodStart, periodEnd);
          timeData[timeKey][userId].loginSeconds = loginTime?.loginSeconds || 0;
        }
      }
    }

    // Calculate cumulative values per user
    const userTotals = {};

    for (const userId of new Set([...filteredDeals.map(d => String(d.userId)), ...filteredSMS.map(s => String(s.userId))])) {
      userTotals[userId] = {
        totalCommission: 0,
        totalDeals: 0,
        totalLoginSeconds: 0,
        totalSmsSent: 0,
        totalSmsDelivered: 0
      };
    }

    // Build time series
    const timeSeries = sortedTimes.map(timeKey => {
      const periodData = timeData[timeKey];

      // Update cumulative totals
      for (const userId in periodData) {
        if (userTotals[userId]) {
          userTotals[userId].totalCommission += periodData[userId].commission;
          userTotals[userId].totalDeals += periodData[userId].deals;
          userTotals[userId].totalLoginSeconds += periodData[userId].loginSeconds;
          userTotals[userId].totalSmsSent += periodData[userId].smsSent;
          userTotals[userId].totalSmsDelivered += periodData[userId].smsDelivered;
        }
      }

      // Build data point
      const dataPoint = { time: timeKey };

      for (const userId in userTotals) {
        const adversusUser = adversusUsers.find(u => String(u.id) === userId);
        const userName = adversusUser?.name || adversusUser?.firstname || `Agent ${userId}`;
        const totals = userTotals[userId];

        // Calculate metric value based on requested metric
        let value = 0;

        switch (metric) {
          case 'deals':
            value = totals.totalDeals;
            break;
          case 'sms_rate':
            value = totals.totalSmsSent > 0
              ? Math.round((totals.totalSmsDelivered / totals.totalSmsSent) * 100)
              : 0;
            break;
          case 'order_per_hour':
            value = totals.totalLoginSeconds > 0
              ? parseFloat(loginTimeCache.calculateDealsPerHour(totals.totalDeals, totals.totalLoginSeconds))
              : 0;
            break;
          case 'commission_per_hour':
            value = totals.totalLoginSeconds > 0
              ? parseFloat((totals.totalCommission / (totals.totalLoginSeconds / 3600)).toFixed(2))
              : 0;
            break;
          default: // commission
            value = Math.round(totals.totalCommission);
        }

        dataPoint[userName] = value;
      }

      return dataPoint;
    });

    // Find top N users by final total
    const finalTotals = Object.entries(userTotals)
      .map(([userId, totals]) => {
        const adversusUser = adversusUsers.find(u => String(u.id) === userId);
        const userName = adversusUser?.name || adversusUser?.firstname || `Agent ${userId}`;

        let total = 0;
        switch (metric) {
          case 'deals':
            total = totals.totalDeals;
            break;
          case 'sms_rate':
            total = totals.totalSmsSent > 0
              ? (totals.totalSmsDelivered / totals.totalSmsSent) * 100
              : 0;
            break;
          case 'order_per_hour':
            total = totals.totalLoginSeconds > 0
              ? parseFloat(loginTimeCache.calculateDealsPerHour(totals.totalDeals, totals.totalLoginSeconds))
              : 0;
            break;
          case 'commission_per_hour':
            total = totals.totalLoginSeconds > 0
              ? totals.totalCommission / (totals.totalLoginSeconds / 3600)
              : 0;
            break;
          default:
            total = totals.totalCommission;
        }

        return { userId, name: userName, total };
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

    console.log(`✅ Standalone history data generated: ${filteredTimeSeries.length} time points, ${topUserNames.length} users`);

    res.json({
      timeSeries: filteredTimeSeries,
      topUsers: finalTotals,
      metric: metric,
      groupedBy: 'day',
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching standalone history:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
