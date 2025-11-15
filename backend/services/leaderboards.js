const fs = require('fs').promises;
const path = require('path');

class LeaderboardService {
  constructor() {
    // PERSISTENT DISK på Render!
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.leaderboardsFile = path.join(this.dbPath, 'leaderboards.json');
    
    console.log(`💾 Leaderboards path: ${this.dbPath} (isRender: ${isRender})`);
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa leaderboards.json
      try {
        await fs.access(this.leaderboardsFile);
        console.log('✅ leaderboards.json exists');
      } catch {
        await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards: [] }, null, 2));
        console.log('📝 Created leaderboards.json');
      }
    } catch (error) {
      console.error('Error initializing leaderboards database:', error);
    }
  }

  async getLeaderboards() {
    const data = await fs.readFile(this.leaderboardsFile, 'utf8');
    return JSON.parse(data).leaderboards;
  }

  async getLeaderboard(id) {
    const leaderboards = await this.getLeaderboards();
    const leaderboard = leaderboards.find(lb => lb.id === id);

    // If this is a team-battle and battleId is missing, fetch it from database
    if (leaderboard && leaderboard.type === 'team-battle' && !leaderboard.battleId) {
      try {
        const postgres = require('./postgres');
        const battleResult = await postgres.query(
          'SELECT id FROM team_battles WHERE leaderboard_id = $1',
          [id]
        );

        if (battleResult.rows.length > 0) {
          leaderboard.battleId = battleResult.rows[0].id;
          console.log(`✅ Retrieved battleId ${leaderboard.battleId} for leaderboard ${id}`);
        }
      } catch (error) {
        console.error(`⚠️ Failed to retrieve battleId for leaderboard ${id}:`, error.message);
      }
    }

    return leaderboard;
  }

  async getActiveLeaderboards() {
    const leaderboards = await this.getLeaderboards();
    return leaderboards.filter(lb => lb.active);
  }

  async addLeaderboard(leaderboard) {
    const leaderboards = await this.getLeaderboards();

    const newLeaderboard = {
      id: Date.now().toString(),
      name: leaderboard.name,
      type: leaderboard.type || 'standard', // 'standard' | 'metrics-grid' | 'team-battle' | 'trend-chart'
      userGroups: leaderboard.userGroups || [],
      timePeriod: leaderboard.timePeriod || 'month',
      customStartDate: leaderboard.customStartDate || null,
      customEndDate: leaderboard.customEndDate || null,
      visibleColumns: leaderboard.visibleColumns || {
        dealsPerHour: true,
        deals: true,
        sms: true,
        commission: true,
        campaignBonus: true,
        total: true
      },
      columnOrder: leaderboard.columnOrder || ['dealsPerHour', 'deals', 'sms', 'commission', 'campaignBonus', 'total'],
      sortBy: leaderboard.sortBy || 'commission',
      // Logos
      brandLogo: leaderboard.brandLogo || null, // Left side - varumärke
      companyLogo: leaderboard.companyLogo || null, // Right side - företag
      // NEW: Enhanced display options
      displayMode: leaderboard.displayMode || 'individual', // 'individual' | 'groups'
      topN: leaderboard.topN || null, // null = show all, otherwise limit to top N
      visualizationMode: leaderboard.visualizationMode || 'table', // 'table' | 'cards' | 'progress' | 'rocket' | 'race'
      showGraphs: leaderboard.showGraphs !== undefined ? leaderboard.showGraphs : false,
      showGap: leaderboard.showGap !== undefined ? leaderboard.showGap : true,
      showMiniStats: leaderboard.showMiniStats !== undefined ? leaderboard.showMiniStats : false,
      // Goal configuration for race modes
      goalValue: leaderboard.goalValue || null, // null = auto (max value), number = custom goal
      goalLabel: leaderboard.goalLabel || '', // e.g., "Race mot 100k!"
      // Auto-scroll configuration
      enableAutoScroll: leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true,
      // METRICS GRID specific fields
      selectedGroups: leaderboard.selectedGroups || [], // Array of group IDs to compare
      metrics: leaderboard.metrics || [], // Array of metric configs: [{id, label, timePeriod, metric}, ...]
      colorRules: leaderboard.colorRules || {}, // Color coding rules per metric
      // TEAM BATTLE specific fields
      description: leaderboard.description || '',
      battleStartDate: leaderboard.battleStartDate || null,
      battleEndDate: leaderboard.battleEndDate || null,
      victoryCondition: leaderboard.victoryCondition || 'highest_at_end',
      victoryMetric: leaderboard.victoryMetric || 'commission_per_hour',
      targetValue: leaderboard.targetValue || null,
      teams: leaderboard.teams || [],
      // TREND CHART specific fields
      trendDays: leaderboard.trendDays || null,
      trendHours: leaderboard.trendHours || null,
      trendMetrics: leaderboard.trendMetrics || [],
      refreshInterval: leaderboard.refreshInterval || 35000, // 35 seconds (match frontend default)
      active: leaderboard.active !== undefined ? leaderboard.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // If type is team-battle, create corresponding team_battles entry in Postgres
    if (newLeaderboard.type === 'team-battle') {
      const postgres = require('./postgres');

      try {
        const client = await postgres.getClient();
        try {
          await client.query('BEGIN');

          // For custom period, use provided dates. Otherwise use dummy dates (will be calculated dynamically)
          // If custom dates are provided as YYYY-MM-DD, convert to full datetime
          let startDate, endDate;
          if (newLeaderboard.timePeriod === 'custom' && newLeaderboard.battleStartDate && newLeaderboard.battleEndDate) {
            const battleStart = newLeaderboard.battleStartDate;
            const battleEnd = newLeaderboard.battleEndDate;
            startDate = battleStart.includes('T') ? battleStart : `${battleStart}T00:00:00.000Z`;
            endDate = battleEnd.includes('T') ? battleEnd : `${battleEnd}T23:59:59.999Z`;
          } else {
            startDate = new Date().toISOString();
            endDate = new Date().toISOString();
          }

          // Insert battle
          const battleQuery = `
            INSERT INTO team_battles (
              leaderboard_id, name, description, time_period, start_date, end_date,
              victory_condition, victory_metric, target_value, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `;

          const battleResult = await client.query(battleQuery, [
            newLeaderboard.id,
            newLeaderboard.name,
            newLeaderboard.description || null,
            newLeaderboard.timePeriod || null,
            startDate,
            endDate,
            newLeaderboard.victoryCondition,
            newLeaderboard.victoryMetric,
            newLeaderboard.targetValue || null,
            true
          ]);

          const battleId = battleResult.rows[0].id;

          // Store battle ID in leaderboard for easy reference
          newLeaderboard.battleId = battleId;

          // Insert teams
          for (let i = 0; i < newLeaderboard.teams.length; i++) {
            const team = newLeaderboard.teams[i];
            await client.query(
              `INSERT INTO team_battle_teams (
                battle_id, team_name, team_emoji, color, user_group_ids, display_order
              )
              VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                battleId,
                team.teamName,
                team.teamEmoji || null,
                team.color,
                team.userGroupIds,
                i
              ]
            );
          }

          await client.query('COMMIT');
          console.log(`⚔️ Created team battle with ID ${battleId} for leaderboard "${newLeaderboard.name}"`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        console.error(`❌ Failed to create team battle for leaderboard "${newLeaderboard.name}":`, error);
        throw new Error(`Failed to create team battle: ${error.message}`);
      }
    }

    leaderboards.push(newLeaderboard);
    await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards }, null, 2));
    console.log(`💾 Saved leaderboard "${newLeaderboard.name}" to persistent disk`);
    return newLeaderboard;
  }

  // Alias for consistency with routes
  async createLeaderboard(leaderboard) {
    return await this.addLeaderboard(leaderboard);
  }

  async updateLeaderboard(id, updates) {
    const leaderboards = await this.getLeaderboards();
    const index = leaderboards.findIndex(lb => lb.id === id);

    if (index === -1) {
      throw new Error(`Leaderboard with id ${id} not found`);
    }

    const existingLeaderboard = leaderboards[index];

    // DEBUG: Log trend-chart updates
    if (existingLeaderboard.type === 'trend-chart' || updates.type === 'trend-chart') {
      console.log('🔍 [BACKEND UPDATE DEBUG - TREND CHART]');
      console.log('   Existing trendDays:', existingLeaderboard.trendDays);
      console.log('   Existing trendHours:', existingLeaderboard.trendHours);
      console.log('   Updates trendDays:', updates.trendDays);
      console.log('   Updates trendHours:', updates.trendHours);
      console.log('   Updates timePeriod:', updates.timePeriod);
    }

    const updatedLeaderboard = {
      ...existingLeaderboard,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // DEBUG: Log final merged object
    if (updatedLeaderboard.type === 'trend-chart') {
      console.log('💾 [BACKEND FINAL MERGED OBJECT]');
      console.log('   Final trendDays:', updatedLeaderboard.trendDays);
      console.log('   Final trendHours:', updatedLeaderboard.trendHours);
      console.log('   Final timePeriod:', updatedLeaderboard.timePeriod);
    }

    // If this is a team-battle leaderboard, update the team_battles table too
    if (updatedLeaderboard.type === 'team-battle') {
      const postgres = require('./postgres');

      try {
        // First, find the team_battle by leaderboard_id
        const battleResult = await postgres.query(
          'SELECT id FROM team_battles WHERE leaderboard_id = $1',
          [id]
        );

        if (battleResult.rows.length > 0) {
          const battleId = battleResult.rows[0].id;

          const client = await postgres.getClient();
          try {
            await client.query('BEGIN');

            // For custom period, use provided dates. Otherwise use dummy dates
            // If custom dates are provided as YYYY-MM-DD, convert to full datetime
            let startDate, endDate;
            if (updatedLeaderboard.timePeriod === 'custom' && updatedLeaderboard.battleStartDate && updatedLeaderboard.battleEndDate) {
              const battleStart = updatedLeaderboard.battleStartDate;
              const battleEnd = updatedLeaderboard.battleEndDate;
              startDate = battleStart.includes('T') ? battleStart : `${battleStart}T00:00:00.000Z`;
              endDate = battleEnd.includes('T') ? battleEnd : `${battleEnd}T23:59:59.999Z`;
            } else {
              startDate = updatedLeaderboard.battleStartDate || new Date().toISOString();
              endDate = updatedLeaderboard.battleEndDate || new Date().toISOString();
            }

            // Update battle
            await client.query(
              `UPDATE team_battles
               SET name = $1, description = $2, time_period = $3, start_date = $4, end_date = $5,
                   victory_condition = $6, victory_metric = $7, target_value = $8,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $9`,
              [
                updatedLeaderboard.name,
                updatedLeaderboard.description || null,
                updatedLeaderboard.timePeriod || null,
                startDate,
                endDate,
                updatedLeaderboard.victoryCondition,
                updatedLeaderboard.victoryMetric,
                updatedLeaderboard.targetValue || null,
                battleId
              ]
            );

            // Delete existing teams
            await client.query('DELETE FROM team_battle_teams WHERE battle_id = $1', [battleId]);

            // Insert new teams
            if (updatedLeaderboard.teams && updatedLeaderboard.teams.length > 0) {
              for (let i = 0; i < updatedLeaderboard.teams.length; i++) {
                const team = updatedLeaderboard.teams[i];
                await client.query(
                  `INSERT INTO team_battle_teams (
                    battle_id, team_name, team_emoji, color, user_group_ids, display_order
                  )
                  VALUES ($1, $2, $3, $4, $5, $6)`,
                  [
                    battleId,
                    team.teamName,
                    team.teamEmoji || null,
                    team.color,
                    team.userGroupIds,
                    i
                  ]
                );
              }
            }

            await client.query('COMMIT');
            console.log(`⚔️ Updated team battle with ID ${battleId} for leaderboard "${updatedLeaderboard.name}"`);
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        }
      } catch (error) {
        console.error(`❌ Failed to update team battle for leaderboard "${updatedLeaderboard.name}":`, error);
        throw new Error(`Failed to update team battle: ${error.message}`);
      }
    }

    leaderboards[index] = updatedLeaderboard;
    await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards }, null, 2));
    console.log(`💾 Updated leaderboard "${updatedLeaderboard.name}" on persistent disk`);
    return updatedLeaderboard;
  }

  async deleteLeaderboard(id) {
    const leaderboards = await this.getLeaderboards();
    const leaderboard = leaderboards.find(lb => lb.id === id);

    if (!leaderboard) {
      throw new Error(`Leaderboard with id ${id} not found`);
    }

    // If this is a team-battle leaderboard, delete the team_battles entry too
    if (leaderboard.type === 'team-battle') {
      const postgres = require('./postgres');

      try {
        // team_battle_teams will be cascade deleted via ON DELETE CASCADE
        const result = await postgres.query(
          'DELETE FROM team_battles WHERE leaderboard_id = $1',
          [id]
        );
        console.log(`⚔️  Deleted ${result.rowCount} team battle(s) for leaderboard "${leaderboard.name}"`);
      } catch (error) {
        console.error(`❌ Failed to delete team battle for leaderboard "${leaderboard.name}":`, error);
        // Don't throw - continue with leaderboard deletion
      }
    }

    const filtered = leaderboards.filter(lb => lb.id !== id);
    await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards: filtered }, null, 2));
    console.log(`🗑️  Deleted leaderboard from persistent disk`);
    return true;
  }

  async migrateDealsPerHour() {
    console.log('🔄 Starting migration: Adding dealsPerHour to all leaderboards...\n');

    const leaderboards = await this.getLeaderboards();
    console.log(`📊 Found ${leaderboards.length} leaderboards\n`);

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
        leaderboard.updatedAt = new Date().toISOString();
        updatedCount++;
        console.log(`✅ Updated: ${leaderboard.name}`);
        console.log(`   - visibleColumns.dealsPerHour: ${leaderboard.visibleColumns.dealsPerHour}`);
        console.log(`   - columnOrder: [${leaderboard.columnOrder.join(', ')}]`);
      } else {
        console.log(`⏭️  Skipped: ${leaderboard.name} (already has dealsPerHour)`);
      }
    }

    // Write back to file
    await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards }, null, 2));

    console.log(`\n🎉 Migration complete!`);
    console.log(`   Total leaderboards: ${leaderboards.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${leaderboards.length - updatedCount}`);

    return {
      total: leaderboards.length,
      updated: updatedCount,
      skipped: leaderboards.length - updatedCount
    };
  }

  getDateRange(leaderboard) {
    const now = new Date();
    let startDate, endDate;

    switch (leaderboard.timePeriod) {
      case 'day':
        // Use UTC for all calculations
        startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        console.log(`📅 Day range (UTC): ${startDate.toISOString()} to ${endDate.toISOString()}`);
        break;

      case 'week':
        // Use UTC - Monday to Sunday
        const dayOfWeek = now.getUTCDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0 days back, Sunday = 6 days back
        startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        console.log(`📅 Week range (UTC): ${startDate.toISOString()} to ${endDate.toISOString()}`);
        break;

      case 'month':
        // Use UTC - First day of month to now
        startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        console.log(`📅 Month range (UTC): ${startDate.toISOString()} to ${endDate.toISOString()}`);
        break;

      case 'custom':
        // Use UTC - parse custom dates
        const customStart = new Date(leaderboard.customStartDate);
        const customEnd = new Date(leaderboard.customEndDate);
        startDate = new Date(Date.UTC(customStart.getUTCFullYear(), customStart.getUTCMonth(), customStart.getUTCDate(), 0, 0, 0, 0));
        endDate = new Date(Date.UTC(customEnd.getUTCFullYear(), customEnd.getUTCMonth(), customEnd.getUTCDate(), 23, 59, 59, 999));
        console.log(`📅 Custom range (UTC): ${startDate.toISOString()} to ${endDate.toISOString()}`);
        break;

      default:
        // Default to current month
        startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        console.log(`📅 Default (month) range (UTC): ${startDate.toISOString()} to ${endDate.toISOString()}`);
    }

    return { startDate, endDate };
  }
}

module.exports = new LeaderboardService();
