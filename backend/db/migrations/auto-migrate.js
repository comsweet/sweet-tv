/**
 * Auto-migration script that runs on server startup
 * Updates team_battles CHECK constraint to include commission_per_hour
 */

const postgres = require('../../services/postgres');

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');

    // Check if constraint needs updating
    const checkConstraint = await postgres.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name = 'team_battles_victory_metric_check'
      AND constraint_schema = 'public'
    `);

    if (checkConstraint.rows.length > 0) {
      const currentConstraint = checkConstraint.rows[0].check_clause;

      // Check if commission_per_hour is already in constraint
      if (!currentConstraint.includes('commission_per_hour')) {
        console.log('📝 Updating team_battles victory_metric constraint...');

        // Drop old constraint
        await postgres.query(`
          ALTER TABLE team_battles
          DROP CONSTRAINT IF EXISTS team_battles_victory_metric_check
        `);

        // Add new constraint with commission_per_hour
        await postgres.query(`
          ALTER TABLE team_battles
          ADD CONSTRAINT team_battles_victory_metric_check
          CHECK (victory_metric IN ('commission', 'deals', 'order_per_hour', 'commission_per_hour', 'sms_rate'))
        `);

        console.log('✅ Migration complete: commission_per_hour added to constraint');
      } else {
        console.log('✅ Migration already applied: commission_per_hour constraint is up to date');
      }
    } else {
      console.log('⚠️  team_battles table or constraint not found, skipping migration');
    }
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    // Don't throw - allow server to start even if migration fails
  }
}

module.exports = { runMigrations };
