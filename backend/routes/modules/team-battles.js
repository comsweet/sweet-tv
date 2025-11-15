const express = require('express');
const router = express.Router();
const postgres = require('../../services/postgres');
const dealsCache = require('../../services/dealsCache');
const smsCache = require('../../services/smsCache');
const loginTimeCache = require('../../services/loginTimeCache');
const adversusAPI = require('../../services/adversusAPI');
const userCache = require('../../services/userCache');

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
      startDate,
      endDate,
      victoryCondition,
      victoryMetric,
      targetValue,
      teams
    } = req.body;

    // Validation
    if (!name || !startDate || !endDate || !victoryCondition || !victoryMetric) {
      return res.status(400).json({ error: 'Missing required fields' });
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
          leaderboard_id, name, description, start_date, end_date,
          victory_condition, victory_metric, target_value, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const battleResult = await client.query(battleQuery, [
        leaderboardId || null,
        name,
        description || null,
        startDate,
        endDate,
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
      startDate,
      endDate,
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
            start_date = COALESCE($3, start_date),
            end_date = COALESCE($4, end_date),
            victory_condition = COALESCE($5, victory_condition),
            victory_metric = COALESCE($6, victory_metric),
            target_value = COALESCE($7, target_value),
            is_active = COALESCE($8, is_active),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING *
      `;

      const battleResult = await client.query(battleQuery, [
        name,
        description,
        startDate,
        endDate,
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
    const startDate = new Date(battle.start_date);
    const endDate = new Date(battle.end_date);

    console.log(`⚔️ Calculating live score for battle "${battle.name}" (ID: ${battleId})`);
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
      const totalSmsSent = teamSMS.reduce((sum, sms) => sum + (sms.count || 1), 0);
      const totalSmsDelivered = teamSMS.filter(sms => sms.status === 'delivered')
        .reduce((sum, sms) => sum + (sms.count || 1), 0);

      // Get login time for team
      let totalLoginSeconds = 0;
      let hasIncompleteData = false;
      for (const userId of teamUserIds) {
        const loginTime = await loginTimeCache.getLoginTime(userId, startDate, endDate);

        // Handle incomplete multi-day data
        if (loginTime === null) {
          hasIncompleteData = true;
          console.warn(`⚠️  User ${userId}: Incomplete loginTime data for period, team score will show null`);
          break; // Stop early - can't calculate accurate metrics
        }

        totalLoginSeconds += loginTime?.loginSeconds || 0;
      }

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
          score = totalSmsSent > 0 ? (totalSmsDelivered / totalSmsSent) * 100 : 0;
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
          smsSent: totalSmsSent,
          smsDelivered: totalSmsDelivered,
          smsRate: totalSmsSent > 0 ? (totalSmsDelivered / totalSmsSent) * 100 : 0,
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
        startDate: battle.start_date,
        endDate: battle.end_date
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
