const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    console.log('\n=== DEBUGGING SINFRID BANGKOK (GROUP 1317) - 4 NOVEMBER ===\n');

    // 1. Find all users in group 1317
    console.log('📋 Step 1: Find all users in Sinfrid Bangkok (group 1317)...');

    // We need to query Adversus API or check cached data
    const adversusAPI = require('./services/adversusAPI');

    const result = await adversusAPI.getUsers();
    const allUsers = result.users || [];

    const sinfridUsers = allUsers.filter(u => u.group && String(u.group.id) === '1317');

    console.log(`   ✅ Found ${sinfridUsers.length} users in Sinfrid Bangkok:`);
    sinfridUsers.forEach(u => {
      console.log(`      - User ${u.id}: ${u.name}`);
    });

    const userIds = sinfridUsers.map(u => u.id);

    // 2. Get login time for these users on 4 November
    console.log('\n⏱️  Step 2: Get login time for 4 November...');

    const date = '2025-11-04';
    const loginQuery = `
      SELECT
        user_id,
        login_seconds,
        login_seconds/3600.0 as hours,
        from_date,
        to_date,
        synced_at
      FROM user_login_time
      WHERE from_date = $1
        AND user_id = ANY($2)
      ORDER BY user_id
    `;

    const loginResult = await pool.query(loginQuery, [date, userIds]);

    console.log(`   ✅ Found login time for ${loginResult.rows.length} users:`);

    let totalLoginSeconds = 0;
    loginResult.rows.forEach(row => {
      const user = sinfridUsers.find(u => u.id === row.user_id);
      console.log(`      - User ${row.user_id} (${user?.name || 'Unknown'}): ${row.login_seconds}s (${parseFloat(row.hours).toFixed(2)}h)`);
      totalLoginSeconds += parseInt(row.login_seconds);
    });

    console.log(`\n   📊 TOTAL LOGIN TIME: ${totalLoginSeconds}s (${(totalLoginSeconds/3600).toFixed(2)}h)`);

    // 3. Get deals for these users on 4 November
    console.log('\n💼 Step 3: Get deals for 4 November...');

    const dealsQuery = `
      SELECT
        user_id,
        COUNT(*) as deal_count,
        SUM(CAST(multi_deals AS INTEGER)) as total_deals
      FROM deals
      WHERE order_date >= $1
        AND order_date < $1::date + interval '1 day'
        AND user_id = ANY($2)
      GROUP BY user_id
      ORDER BY user_id
    `;

    const dealsResult = await pool.query(dealsQuery, [date, userIds]);

    console.log(`   ✅ Found deals for ${dealsResult.rows.length} users:`);

    let totalDeals = 0;
    dealsResult.rows.forEach(row => {
      const user = sinfridUsers.find(u => u.id === row.user_id);
      console.log(`      - User ${row.user_id} (${user?.name || 'Unknown'}): ${row.total_deals} deals`);
      totalDeals += parseInt(row.total_deals);
    });

    console.log(`\n   📊 TOTAL DEALS: ${totalDeals}`);

    // 4. Calculate order/h
    console.log('\n📈 Step 4: Calculate order/h...');

    const orderPerHour = totalLoginSeconds > 0 ? totalDeals / (totalLoginSeconds / 3600) : 0;

    console.log(`   ✅ CORRECT ORDER/H: ${totalDeals} deals / ${(totalLoginSeconds/3600).toFixed(2)}h = ${orderPerHour.toFixed(2)}`);

    // 5. Check what trend chart would calculate
    console.log('\n🔍 Step 5: Simulate trend chart calculation...');

    // Trend chart groups by user group and sums all users in that group
    // Let's see if there's any issue with how data is stored or retrieved

    const trendQuery = `
      SELECT
        user_id,
        login_seconds,
        from_date,
        to_date
      FROM user_login_time
      WHERE from_date = $1
        AND to_date >= $1::date + interval '23 hours 59 minutes'
        AND user_id = ANY($2)
      ORDER BY user_id
    `;

    const trendResult = await pool.query(trendQuery, [date, userIds]);

    console.log(`   📊 Trend chart would find ${trendResult.rows.length} login time records:`);

    let trendTotalSeconds = 0;
    trendResult.rows.forEach(row => {
      const user = sinfridUsers.find(u => u.id === row.user_id);
      console.log(`      - User ${row.user_id} (${user?.name || 'Unknown'}): ${row.login_seconds}s`);
      console.log(`        Period: ${new Date(row.from_date).toISOString()} → ${new Date(row.to_date).toISOString()}`);
      trendTotalSeconds += parseInt(row.login_seconds);
    });

    console.log(`\n   📊 Trend chart total: ${trendTotalSeconds}s (${(trendTotalSeconds/3600).toFixed(2)}h)`);

    if (trendTotalSeconds !== totalLoginSeconds) {
      console.log(`\n   ⚠️  MISMATCH! Exact query found ${totalLoginSeconds}s but trend query found ${trendTotalSeconds}s`);
      console.log(`   🔍 Difference: ${Math.abs(totalLoginSeconds - trendTotalSeconds)}s`);
    }

    const trendOrderPerHour = trendTotalSeconds > 0 ? totalDeals / (trendTotalSeconds / 3600) : 0;
    console.log(`   📈 Trend chart would calculate: ${totalDeals} / ${(trendTotalSeconds/3600).toFixed(2)}h = ${trendOrderPerHour.toFixed(2)} order/h`);

    // 6. Check if there are duplicate entries or wrong date ranges
    console.log('\n🔍 Step 6: Check for data anomalies...');

    const allEntriesQuery = `
      SELECT
        user_id,
        login_seconds,
        from_date,
        to_date,
        synced_at
      FROM user_login_time
      WHERE user_id = ANY($1)
        AND (
          (from_date <= $2::date + interval '1 day' AND to_date >= $2::date)
          OR from_date = $2
        )
      ORDER BY user_id, from_date
    `;

    const allEntriesResult = await pool.query(allEntriesQuery, [userIds, date]);

    console.log(`\n   📊 All login time entries overlapping with 4 November:`);
    allEntriesResult.rows.forEach(row => {
      const user = sinfridUsers.find(u => u.id === row.user_id);
      const fromDate = new Date(row.from_date).toISOString().split('T')[0];
      const toDate = new Date(row.to_date).toISOString().split('T')[0];
      console.log(`      - User ${row.user_id} (${user?.name || 'Unknown'}):`);
      console.log(`        ${row.login_seconds}s, ${fromDate} → ${toDate}`);
      console.log(`        Synced: ${new Date(row.synced_at).toISOString()}`);
    });

    console.log('\n=== ANALYSIS COMPLETE ===\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
