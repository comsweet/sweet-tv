// Migration: Add Team Battles tables
// Run with: node backend/migrations/add-team-battles.js

const postgres = require('../services/postgres');

async function migrate() {
  console.log('🔄 Starting Team Battles migration...');

  try {
    // Initialize postgres connection
    await postgres.init();
    console.log('✅ Database connection established');

    // Check if tables already exist
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'team_battles'
      );
    `;

    const checkResult = await postgres.query(checkQuery);

    if (checkResult.rows[0].exists) {
      console.log('⚠️  Team Battles tables already exist. Skipping migration.');
      process.exit(0);
    }

    console.log('📋 Creating team_battles table...');

    // Create team_battles table
    await postgres.query(`
      CREATE TABLE IF NOT EXISTS team_battles (
        id SERIAL PRIMARY KEY,
        leaderboard_id INTEGER REFERENCES leaderboards(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,

        -- Victory condition: how to determine the winner
        victory_condition VARCHAR(50) NOT NULL CHECK (victory_condition IN ('first_to_target', 'highest_at_end', 'best_average')),

        -- Victory metric: what to measure
        victory_metric VARCHAR(50) NOT NULL CHECK (victory_metric IN ('commission', 'deals', 'order_per_hour', 'commission_per_hour', 'sms_rate')),

        -- Target value (only used for first_to_target)
        target_value DECIMAL(10, 2),

        -- Status
        is_active BOOLEAN DEFAULT true,
        winner_team_id INTEGER, -- Will reference team_battle_teams(id) after creation

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📋 Creating team_battle_teams table...');

    // Create team_battle_teams table
    await postgres.query(`
      CREATE TABLE IF NOT EXISTS team_battle_teams (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER REFERENCES team_battles(id) ON DELETE CASCADE,
        team_name VARCHAR(255) NOT NULL,
        team_emoji VARCHAR(10), -- Optional emoji (🇹🇭, 🇸🇪, etc)
        color VARCHAR(7) NOT NULL, -- Hex color (#FF6B6B)
        user_group_ids INTEGER[] NOT NULL, -- Array of Adversus group IDs
        display_order INTEGER DEFAULT 0,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Ensure unique team names within a battle
        UNIQUE(battle_id, team_name)
      );
    `);

    console.log('🔗 Adding foreign key constraint...');

    // Add foreign key for winner after team_battle_teams is created
    await postgres.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_team_battles_winner'
        ) THEN
          ALTER TABLE team_battles
          ADD CONSTRAINT fk_team_battles_winner
          FOREIGN KEY (winner_team_id) REFERENCES team_battle_teams(id) ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    console.log('📇 Creating indexes...');

    // Create indexes
    await postgres.query(`
      CREATE INDEX IF NOT EXISTS idx_team_battles_leaderboard_id ON team_battles(leaderboard_id);
      CREATE INDEX IF NOT EXISTS idx_team_battles_is_active ON team_battles(is_active);
      CREATE INDEX IF NOT EXISTS idx_team_battles_dates ON team_battles(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_team_battle_teams_battle_id ON team_battle_teams(battle_id);
    `);

    console.log('⚡ Creating trigger...');

    // Create trigger for updated_at
    await postgres.query(`
      DROP TRIGGER IF EXISTS update_team_battles_updated_at ON team_battles;
      CREATE TRIGGER update_team_battles_updated_at BEFORE UPDATE ON team_battles
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✅ Team Battles migration completed successfully!');
    console.log('');
    console.log('📊 Tables created:');
    console.log('  - team_battles');
    console.log('  - team_battle_teams');
    console.log('');
    console.log('🎉 You can now create Team Battles in the Admin UI!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrate();
