const adversusAPI = require('./services/adversusAPI');
const loginTimeCache = require('./services/loginTimeCache');

(async () => {
  try {
    console.log('\n=== SIMULATING SYNC FOR 4 NOVEMBER ===\n');

    await loginTimeCache.init();

    const userIds = ['236442', '248512', '268838']; // Hampus, Marcus, Jakob

    // Date: 4 November 2025 (00:00 - 23:59)
    const fromDate = new Date('2025-11-04T00:00:00.000Z');
    const toDate = new Date('2025-11-04T23:59:59.999Z');

    console.log(`📅 Syncing for: ${fromDate.toISOString()} → ${toDate.toISOString()}\n`);

    // Call the EXACT same method that central sync uses
    console.log('🔄 Calling loginTimeCache.syncLoginTimeForUsers()...\n');

    const results = await loginTimeCache.syncLoginTimeForUsers(
      adversusAPI,
      userIds,
      fromDate,
      toDate
    );

    console.log('\n📊 RESULTS FROM SYNC:\n');
    results.forEach(result => {
      const hours = (result.loginSeconds / 3600).toFixed(2);
      console.log(`   User ${result.userId}: ${result.loginSeconds}s (${hours}h)`);
    });

    const total = results.reduce((sum, r) => sum + r.loginSeconds, 0);
    console.log(`\n   🎯 TOTAL: ${total}s (${(total/3600).toFixed(2)}h)`);

    // Now check what got saved to database
    console.log('\n🔍 Verifying what was saved to database...\n');

    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const query = `
      SELECT user_id, login_seconds, from_date, to_date, synced_at
      FROM user_login_time
      WHERE from_date = $1
        AND to_date >= $1::date + interval '23 hours 59 minutes'
        AND user_id = ANY($2)
      ORDER BY synced_at DESC
      LIMIT 10
    `;

    const dbResult = await pool.query(query, ['2025-11-04', userIds.map(id => parseInt(id))]);

    console.log(`   📊 Found ${dbResult.rows.length} records in database:\n`);
    dbResult.rows.forEach(row => {
      const hours = (row.login_seconds / 3600).toFixed(2);
      console.log(`   User ${row.user_id}: ${row.login_seconds}s (${hours}h)`);
      console.log(`      Period: ${new Date(row.from_date).toISOString()} → ${new Date(row.to_date).toISOString()}`);
      console.log(`      Synced: ${new Date(row.synced_at).toISOString()}\n`);
    });

    await pool.end();

    console.log('=== SYNC TEST COMPLETE ===\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
})();
