const fs = require('fs').promises;
const path = require('path');

/**
 * Migration script to add dealsPerHour to all existing leaderboards
 */
async function migrateLeaderboards() {
  try {
    console.log('🔄 Starting migration: Adding dealsPerHour to all leaderboards...\n');

    // Determine the correct path (Render vs local)
    const isRender = process.env.RENDER === 'true';
    const dbPath = isRender ? '/var/data' : path.join(__dirname, '../data');
    const leaderboardsFile = path.join(dbPath, 'leaderboards.json');

    console.log(`📂 Reading from: ${leaderboardsFile}`);

    // Read existing leaderboards
    const data = await fs.readFile(leaderboardsFile, 'utf8');
    const { leaderboards } = JSON.parse(data);

    console.log(`📊 Found ${leaderboards.length} leaderboards\n`);

    let updatedCount = 0;

    // Update each leaderboard
    for (const leaderboard of leaderboards) {
      let needsUpdate = false;
      const before = JSON.stringify(leaderboard);

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

      // Update timestamp if changes were made
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
    await fs.writeFile(leaderboardsFile, JSON.stringify({ leaderboards }, null, 2));

    console.log(`\n🎉 Migration complete!`);
    console.log(`   Total leaderboards: ${leaderboards.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${leaderboards.length - updatedCount}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateLeaderboards();
