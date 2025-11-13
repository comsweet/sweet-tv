const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    console.log('\n=== CLEANING UP BIG PERIOD ENTRIES ===\n');

    // Find all entries where the period is longer than 1 day
    const findQuery = `
      SELECT
        user_id,
        from_date,
        to_date,
        login_seconds,
        EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as days,
        synced_at
      FROM user_login_time
      WHERE EXTRACT(EPOCH FROM (to_date - from_date)) > 86400
      ORDER BY user_id, from_date
    `;

    const findResult = await pool.query(findQuery);

    console.log(`🔍 Found ${findResult.rows.length} entries with periods > 1 day:\n`);

    if (findResult.rows.length === 0) {
      console.log('✅ No big period entries found - database is clean!\n');
      await pool.end();
      return;
    }

    // Group by user to show summary
    const userSummary = {};
    findResult.rows.forEach(row => {
      if (!userSummary[row.user_id]) {
        userSummary[row.user_id] = {
          count: 0,
          totalSeconds: 0
        };
      }
      userSummary[row.user_id].count++;
      userSummary[row.user_id].totalSeconds += parseInt(row.login_seconds);
    });

    console.log('📊 Summary by user:\n');
    Object.entries(userSummary).forEach(([userId, summary]) => {
      console.log(`   User ${userId}: ${summary.count} big periods, total ${summary.totalSeconds}s (${(summary.totalSeconds/3600).toFixed(1)}h)`);
    });

    // Show some examples
    console.log('\n📋 Sample entries (first 10):\n');
    findResult.rows.slice(0, 10).forEach(row => {
      const fromStr = new Date(row.from_date).toISOString().split('T')[0];
      const toStr = new Date(row.to_date).toISOString().split('T')[0];
      console.log(`   User ${row.user_id}: ${fromStr} → ${toStr} (${parseFloat(row.days).toFixed(1)} days, ${row.login_seconds}s)`);
    });

    // Delete these entries
    console.log(`\n🗑️  Deleting ${findResult.rows.length} big period entries...\n`);

    const deleteQuery = `
      DELETE FROM user_login_time
      WHERE EXTRACT(EPOCH FROM (to_date - from_date)) > 86400
    `;

    const deleteResult = await pool.query(deleteQuery);

    console.log(`✅ Deleted ${deleteResult.rowCount} entries\n`);
    console.log('💡 These entries will be re-synced per day from Adversus API when needed.\n');
    console.log('=== CLEANUP COMPLETE ===\n');

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
