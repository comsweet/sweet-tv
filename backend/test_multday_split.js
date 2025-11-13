const loginTimeCache = require('./services/loginTimeCache');
const adversusAPI = require('./services/adversusAPI');

/**
 * Test that multi-day syncs are automatically split into single days
 * This prevents creating "big period" entries in the database
 */
(async () => {
  try {
    console.log('\n=== TESTING MULTI-DAY AUTO-SPLIT ===\n');

    // Test syncing 3 days (should auto-split into 3 separate day syncs)
    const testUsers = ['236442', '248512', '268838']; // Hampus, Marcus, Jakob

    // Date range: Nov 4-6 (3 days)
    const fromDate = new Date('2025-11-04T00:00:00.000Z');
    const toDate = new Date('2025-11-06T23:59:59.999Z');

    console.log(`📅 Requesting sync for 3 days: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}\n`);
    console.log('🔍 Watch for auto-split messages...\n');

    const results = await loginTimeCache.syncLoginTimeForUsers(
      adversusAPI,
      testUsers,
      fromDate,
      toDate
    );

    console.log('\n✅ Sync complete!\n');
    console.log(`📊 Got ${results.length} results (should be 3 users × 3 days = 9 if all have data)\n`);

    // Group by date to verify each day was synced separately
    const byDate = {};
    results.forEach(r => {
      const date = new Date(r.fromDate).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(r);
    });

    console.log('📋 Results grouped by date:\n');
    Object.entries(byDate).forEach(([date, dayResults]) => {
      console.log(`   ${date}: ${dayResults.length} users`);
      dayResults.forEach(r => {
        const hours = (r.loginSeconds / 3600).toFixed(2);
        console.log(`      User ${r.userId}: ${r.loginSeconds}s (${hours}h)`);
      });
    });

    // Verify no "big period" entries in database
    console.log('\n🔍 Verifying no big period entries in database...\n');

    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const checkQuery = `
      SELECT
        user_id,
        from_date,
        to_date,
        login_seconds,
        EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as days
      FROM user_login_time
      WHERE user_id = ANY($1)
        AND from_date >= $2
        AND to_date <= $3
        AND EXTRACT(EPOCH FROM (to_date - from_date)) > 86400
    `;

    const bigPeriods = await pool.query(checkQuery, [
      testUsers.map(id => parseInt(id)),
      fromDate.toISOString(),
      toDate.toISOString()
    ]);

    if (bigPeriods.rows.length === 0) {
      console.log('   ✅ NO big period entries found! Auto-split working correctly!\n');
    } else {
      console.log(`   ❌ WARNING: Found ${bigPeriods.rows.length} big period entries:\n`);
      bigPeriods.rows.forEach(row => {
        console.log(`      User ${row.user_id}: ${row.days.toFixed(1)} days`);
      });
    }

    await pool.end();

    console.log('=== TEST COMPLETE ===\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
})();
