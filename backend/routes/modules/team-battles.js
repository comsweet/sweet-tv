const express = require('express');
const router = express.Router();
const postgres = require('../../services/postgres');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const loginTimeCache = require('../../services/loginTimeCache');
const adversusAPI = require('../../services/adversusAPI');
const userCache = require('../../services/userCache');
const leaderboardService = require('../../services/leaderboards');

// ==================== TEAM BATTLES CRUD ====================

// Get all team battles
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT tb.*,
        json_agg(
          json_build_object(
            'id', tbt.id,
            'teamName', tbt.team_name,
            'teamEmoji', tbt.team_emoji,
            'color', tbt.color,
            'userGroupIds', tbt.user_group_ids,
            'displayOrder', tbt.display_order
          ) ORDER BY tbt.display_order
        ) AS teams
      FROM team_battles tb
      LEFT JOIN team_battle_teams tbt ON tb.id = tbt.battle_id
      GROUP BY tb.id
      ORDER BY tb.created_at DESC
    `;

    const result = await postgres.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching team battles:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single team battle
router.get('/:id', async (req, res) => {
  try {
    const battleId = req.params.id;

    const query = `
      SELECT tb.*,
        json_agg(
          json_build_object(
            'id', tbt.id,
            'teamName', tbt.team_name,
            'teamEmoji', tbt.team_emoji,
            'color', tbt.color,
            'userGroupIds', tbt.user_group_ids,
            'displayOrder', tbt.display_order
          ) ORDER BY tbt.display_order
        ) AS teams
      FROM team_battles tb
      LEFT JOIN team_battle_teams tbt ON tb.id = tbt.battle_id
      WHERE tb.id = $1
      GROUP BY tb.id
    `;

    const result = await postgres.query(query, [battleId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team battle not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching team battle:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create team battle
router.post('/', async (req, res) => {
  try {
    const {
      leaderboardId,
      name,
      description,
      timePeriod,
      victoryCondition,
      victoryMetric,
      targetValue,
      teams
    } = req.body;

    // Validation
    if (!name || !victoryCondition || !victoryMetric) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Time period is required (either direct or via leaderboard)
    if (!timePeriod && !leaderboardId) {
      return res.status(400).json({ error: 'Either timePeriod or leaderboardId is required' });
    }

    if (!teams || teams.length < 2 || teams.length > 4) {
      return res.status(400).json({ error: 'Must have between 2 and 4 teams' });
    }

    // Start transaction
    const client = await postgres.getClient();
    try {
      await client.query('BEGIN');

      // Insert battle
      const battleQuery = `
        INSERT INTO team_battles (
          leaderboard_id, name, description, time_period,
          victory_condition, victory_metric, target_value, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const battleResult = await client.query(battleQuery, [
        leaderboardId || null,
        name,
        description || null,
        timePeriod || null,
        victoryCondition,
        victoryMetric,
        targetValue || null,
        true
      ]);

      const battle = battleResult.rows[0];

      // Insert teams
      const teamInserts = teams.map((team, index) => {
        return client.query(
          `INSERT INTO team_battle_teams (
            battle_id, team_name, team_emoji, color, user_group_ids, display_order
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            battle.id,
            team.teamName,
            team.teamEmoji || null,
            team.color,
            team.userGroupIds,
            team.displayOrder || index
          ]
        );
      });

      const teamResults = await Promise.all(teamInserts);

      await client.query('COMMIT');

      // Return battle with teams
      res.status(201).json({
        ...battle,
        teams: teamResults.map(r => r.rows[0])
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error creating team battle:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update team battle
router.put('/:id', async (req, res) => {
  try {
    const battleId = req.params.id;
    const {
      name,
      description,
      timePeriod,
      victoryCondition,
      victoryMetric,
      targetValue,
      isActive,
      teams
    } = req.body;

    const client = await postgres.getClient();
    try {
      await client.query('BEGIN');

      // Update battle
      const battleQuery = `
        UPDATE team_battles
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            time_period = $3,
            victory_condition = COALESCE($4, victory_condition),
            victory_metric = COALESCE($5, victory_metric),
            target_value = COALESCE($6, target_value),
            is_active = COALESCE($7, is_active),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `;

      const battleResult = await client.query(battleQuery, [
        name,
        description,
        timePeriod !== undefined ? timePeriod : null, // Allow explicit null to clear timePeriod
        victoryCondition,
        victoryMetric,
        targetValue,
        isActive,
        battleId
      ]);

      if (battleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Team battle not found' });
      }

      // Update teams if provided
      if (teams && Array.isArray(teams)) {
        // Delete existing teams
        await client.query('DELETE FROM team_battle_teams WHERE battle_id = $1', [battleId]);

        // Insert new teams
        const teamInserts = teams.map((team, index) => {
          return client.query(
            `INSERT INTO team_battle_teams (
              battle_id, team_name, team_emoji, color, user_group_ids, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
              battleId,
              team.teamName,
              team.teamEmoji || null,
              team.color,
              team.userGroupIds,
              team.displayOrder || index
            ]
          );
        });

        await Promise.all(teamInserts);
      }

      await client.query('COMMIT');

      // Fetch updated battle with teams
      const finalQuery = `
        SELECT tb.*,
          json_agg(
            json_build_object(
              'id', tbt.id,
              'teamName', tbt.team_name,
              'teamEmoji', tbt.team_emoji,
              'color', tbt.color,
              'userGroupIds', tbt.user_group_ids,
              'displayOrder', tbt.display_order
            ) ORDER BY tbt.display_order
          ) AS teams
        FROM team_battles tb
        LEFT JOIN team_battle_teams tbt ON tb.id = tbt.battle_id
        WHERE tb.id = $1
        GROUP BY tb.id
      `;

      const finalResult = await postgres.query(finalQuery, [battleId]);
      res.json(finalResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error updating team battle:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete team battle
router.delete('/:id', async (req, res) => {
  try {
    const battleId = req.params.id;

    const result = await postgres.query(
      'DELETE FROM team_battles WHERE id = $1 RETURNING *',
      [battleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team battle not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('❌ Error deleting team battle:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== LIVE SCORE CALCULATION ====================

// Get live scores for a team battle
router.get('/:id/live-score', async (req, res) => {
  try {
    const battleId = req.params.id;

    // Get battle config
    const battleQuery = `
      SELECT tb.*,
        json_agg(
          json_build_object(
            'id', tbt.id,
            'teamName', tbt.team_name,
            'teamEmoji', tbt.team_emoji,
            'color', tbt.color,
            'userGroupIds', tbt.user_group_ids,
            'displayOrder', tbt.display_order
          ) ORDER BY tbt.display_order
        ) AS teams
      FROM team_battles tb
      LEFT JOIN team_battle_teams tbt ON tb.id = tbt.battle_id
      WHERE tb.id = $1
      GROUP BY tb.id
    `;

    const battleResult = await postgres.query(battleQuery, [battleId]);

    if (battleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team battle not found' });
    }

    const battle = battleResult.rows[0];

    // DYNAMIC PERIOD SUPPORT - Priority order:
    // 1. battle.time_period (if set)
    // 2. leaderboard's time_period (if linked)
    let startDate, endDate, periodSource;

    if (battle.time_period) {
      // Priority 1: Use battle's own time_period
      const dateRange = leaderboardService.getDateRange({ timePeriod: battle.time_period });
      startDate = dateRange.startDate;
      endDate = dateRange.endDate;
      periodSource = 'battle';
      console.log(`⚔️ Battle "${battle.name}" using period from battle setting (${battle.time_period})`);
      console.log(`   Period: ${startDate.toISOString()} → ${endDate.toISOString()}`);
    } else if (battle.leaderboard_id) {
      // Priority 2: Use leaderboard's time_period
      const leaderboardQuery = 'SELECT * FROM leaderboards WHERE id = $1';
      const leaderboardResult = await postgres.query(leaderboardQuery, [battle.leaderboard_id]);

      if (leaderboardResult.rows.length === 0) {
        return res.status(400).json({ error: 'Linked leaderboard not found' });
      }

      const leaderboard = leaderboardResult.rows[0];
      const dateRange = leaderboardService.getDateRange(leaderboard);
      startDate = dateRange.startDate;
      endDate = dateRange.endDate;
      periodSource = 'leaderboard';
      console.log(`⚔️ Battle "${battle.name}" using period from leaderboard (${leaderboard.time_period})`);
      console.log(`   Period: ${startDate.toISOString()} → ${endDate.toISOString()}`);
    } else if (battle.start_date && battle.end_date) {
      // Fallback for old battles created with static dates
      startDate = new Date(battle.start_date);
      endDate = new Date(battle.end_date);
      periodSource = 'legacy_static';
      console.log(`⚔️ Battle "${battle.name}" using LEGACY static dates (created before dynamic periods)`);
      console.log(`   Period: ${startDate.toISOString()} → ${endDate.toISOString()}`);
      console.warn(`   ⚠️ Consider updating this battle to use time_period or link to a leaderboard`);
    } else {
      // No time period configured at all
      return res.status(400).json({ error: 'Battle has no time_period, leaderboard, or static dates configured' });
    }

    console.log(`   Teams from DB:`, battle.teams);
    console.log(`   Teams count: ${battle.teams ? battle.teams.length : 0}`);

    // Validate teams data
    if (!battle.teams || !Array.isArray(battle.teams) || battle.teams.length === 0) {
      console.warn(`⚠️ No teams found for battle ${battleId}`);
      console.warn(`   Battle data keys:`, Object.keys(battle));
      return res.json({
        battle: {
          id: battle.id,
          name: battle.name,
          victoryCondition: battle.victory_condition,
          victoryMetric: battle.victory_metric,
          targetValue: battle.target_value,
          startDate: battle.start_date,
          endDate: battle.end_date
        },
        teamScores: [],
        leader: null,
        leadingBy: 0,
        leaderFormattedLeadingBy: '',
        victoryAchieved: false,
        winner: null,
        timestamp: new Date().toISOString()
      });
    }

    // Get users from cache (with fallback to API if cache not initialized)
    const adversusUsers = await userCache.getUsers({ adversusAPI });

    // Get deals and SMS from cache
    const cachedDeals = await dealsCache.getDealsInRange(startDate, endDate);
    const cachedSMS = await smsCache.getSMSInRange(startDate, endDate);

    // Calculate scores for each team
    const teamScores = [];

    for (const team of battle.teams) {
      const normalizedGroupIds = team.userGroupIds.map(g => String(g));

      // Find users in this team
      const teamUserIds = adversusUsers
        .filter(u => u.group && u.group.id && normalizedGroupIds.includes(String(u.group.id)))
        .map(u => String(u.id));

      // Filter deals for this team
      const teamDeals = cachedDeals.filter(deal =>
        teamUserIds.includes(String(deal.userId))
      );

      // Filter SMS for this team
      const teamSMS = cachedSMS.filter(sms =>
        teamUserIds.includes(String(sms.userId))
      );

      // Calculate metrics
      const totalCommission = teamDeals.reduce((sum, deal) => sum + parseFloat(deal.commission || 0), 0);
      const totalDeals = teamDeals.reduce((sum, deal) => sum + parseInt(deal.multiDeals || '1'), 0);

      // Calculate unique SMS: distinct (receiver, date) pairs
      // This matches the definition in smsCache.js
      const uniqueReceiverDates = new Set();
      teamSMS.forEach(sms => {
        const date = new Date(sms.timestamp).toISOString().split('T')[0];
        const key = `${sms.receiver}|${date}`;
        uniqueReceiverDates.add(key);
      });
      const uniqueSMS = uniqueReceiverDates.size;

      // Get login time for team
      let totalLoginSeconds = 0;
      let hasIncompleteData = false;
      console.log(`📊 [Team ${team.teamName}] Checking login time for ${teamUserIds.length} users...`);

      for (const userId of teamUserIds) {
        const loginTime = await loginTimeCache.getLoginTime(userId, startDate, endDate);

        // Handle incomplete multi-day data
        if (loginTime === null) {
          hasIncompleteData = true;
          console.warn(`⚠️  [Team ${team.teamName}] User ${userId}: Incomplete loginTime data for period, team score will show null`);
          break; // Stop early - can't calculate accurate metrics
        }

        console.log(`   User ${userId}: ${loginTime?.loginSeconds || 0} seconds`);
        totalLoginSeconds += loginTime?.loginSeconds || 0;
      }

      console.log(`📊 [Team ${team.teamName}] Total login time: ${totalLoginSeconds} seconds (${(totalLoginSeconds / 3600).toFixed(2)} hours), hasIncompleteData: ${hasIncompleteData}`);

      // Calculate score based on victory metric
      let score = 0;
      let formattedScore = '';

      switch (battle.victory_metric) {
        case 'commission':
          score = totalCommission;
          formattedScore = `${Math.round(score).toLocaleString()} THB`;
          break;
        case 'deals':
          score = totalDeals;
          formattedScore = `${score} affärer`;
          break;
        case 'sms_rate':
          // FIXED: Use correct formula matching smsCache.getSMSSuccessRate()
          // SMS success rate = (deals / uniqueSMS) * 100
          // This shows how many deals per unique SMS contact (not delivery rate)
          score = uniqueSMS > 0 ? (totalDeals / uniqueSMS) * 100 : 0;
          formattedScore = `${score.toFixed(1)}%`;
          break;
        case 'order_per_hour':
          if (hasIncompleteData) {
            score = null;
            formattedScore = '-';
          } else {
            score = totalLoginSeconds > 0
              ? loginTimeCache.calculateDealsPerHour(totalDeals, totalLoginSeconds)
              : 0;
            formattedScore = score !== null ? `${score.toFixed(2)} affärer/h` : '-';
          }
          break;
        case 'commission_per_hour':
          if (hasIncompleteData) {
            score = null;
            formattedScore = '-';
          } else {
            score = totalLoginSeconds > 0
              ? (totalCommission / totalLoginSeconds) * 3600
              : 0;
            formattedScore = `${Math.round(score).toLocaleString()} THB/h`;
          }
          break;
      }

      teamScores.push({
        team,
        score,
        formattedScore,
        stats: {
          commission: totalCommission,
          deals: totalDeals,
          uniqueSMS: uniqueSMS,
          smsRate: uniqueSMS > 0 ? (totalDeals / uniqueSMS) * 100 : 0,
          loginSeconds: hasIncompleteData ? null : totalLoginSeconds,
          orderPerHour: hasIncompleteData
            ? null
            : (totalLoginSeconds > 0 ? loginTimeCache.calculateDealsPerHour(totalDeals, totalLoginSeconds) : 0),
          commissionPerHour: hasIncompleteData
            ? null
            : (totalLoginSeconds > 0 ? (totalCommission / totalLoginSeconds) * 3600 : 0)
        }
      });
    }

    // Sort by score (highest first)
    teamScores.sort((a, b) => b.score - a.score);

    // Determine leader and progress
    const leader = teamScores[0];
    const leadingBy = teamScores.length > 1 ? leader.score - teamScores[1].score : 0;

    // Check if victory condition is met
    let victoryAchieved = false;
    let winner = null;

    if (battle.victory_condition === 'first_to_target' && battle.target_value) {
      const hasWinner = teamScores.find(t => t.score >= battle.target_value);
      if (hasWinner) {
        victoryAchieved = true;
        winner = hasWinner.team;
      }
    } else if (battle.victory_condition === 'highest_at_end') {
      // Check if battle has ended
      if (new Date() >= endDate) {
        victoryAchieved = true;
        winner = leader.team;
      }
    }

    res.json({
      battle: {
        id: battle.id,
        name: battle.name,
        victoryCondition: battle.victory_condition,
        victoryMetric: battle.victory_metric,
        targetValue: battle.target_value,
        timePeriod: battle.time_period, // Direct time period setting
        leaderboardId: battle.leaderboard_id, // Linked leaderboard (if any)
        periodSource: periodSource, // 'battle' or 'leaderboard'
        effectiveStartDate: startDate.toISOString(), // Actual dates being used for calculation
        effectiveEndDate: endDate.toISOString()
      },
      teamScores,
      leader: leader.team,
      leadingBy,
      leaderFormattedLeadingBy: formatLeadingBy(leadingBy, battle.victory_metric),
      victoryAchieved,
      winner,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error calculating live score:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to format leading by text
function formatLeadingBy(leadingBy, metric) {
  switch (metric) {
    case 'commission':
      return `${Math.round(leadingBy).toLocaleString()} THB`;
    case 'deals':
      return `${leadingBy} affärer`;
    case 'sms_rate':
      return `${leadingBy.toFixed(1)}%`;
    case 'order_per_hour':
      return `${leadingBy.toFixed(2)} affärer/h`;
    case 'commission_per_hour':
      return `${Math.round(leadingBy).toLocaleString()} THB/h`;
    default:
      return String(leadingBy);
  }
}

module.exports = router;
