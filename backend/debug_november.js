/**
 * Debug script to understand why November data has too low login time
 *
 * Run: node backend/debug_november.js
 */

const db = require('./services/postgres');

async function debugNovemberData() {
  try {
    await db.init();
    console.log('✅ Database connected\n');

    console.log('=' .repeat(80));
    console.log('1. NOVEMBER DATA BREAKDOWN - Date Ranges');
    console.log('='.repeat(80));

    const novemberQuery = `
      SELECT
        from_date::date as start_date,
        to_date::date as end_date,
        EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as period_days,
        COUNT(*) as user_count,
        SUM(login_seconds) as total_login_seconds,
        ROUND(SUM(login_seconds) / 3600.0, 2) as total_hours,
        MIN(synced_at) as first_synced,
        MAX(synced_at) as last_synced
      FROM user_login_time
      WHERE from_date >= '2025-11-01' AND from_date < '2025-12-01'
      GROUP BY from_date::date, to_date::date
      ORDER BY from_date::date, to_date::date;
    `;

    const novResults = await db.query(novemberQuery);
    console.table(novResults.rows);

    console.log('\n' + '='.repeat(80));
    console.log('2. NOVEMBER 10 - Detailed User Breakdown (first 10 users)');
    console.log('='.repeat(80));

    const nov10Query = `
      SELECT
        user_id,
        login_seconds,
        ROUND(login_seconds / 3600.0, 2) as hours,
        from_date,
        to_date,
        synced_at
      FROM user_login_time
      WHERE from_date >= '2025-11-10' AND from_date < '2025-11-11'
      ORDER BY user_id
      LIMIT 10;
    `;

    const nov10Results = await db.query(nov10Query);
    console.table(nov10Results.rows);

    console.log('\n' + '='.repeat(80));
    console.log('3. OCTOBER DATA (for comparison) - First 10 days');
    console.log('='.repeat(80));

    const octoberQuery = `
      SELECT
        from_date::date as start_date,
        to_date::date as end_date,
        EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as period_days,
        COUNT(*) as user_count,
        SUM(login_seconds) as total_login_seconds,
        ROUND(SUM(login_seconds) / 3600.0, 2) as total_hours
      FROM user_login_time
      WHERE from_date >= '2025-10-01' AND from_date < '2025-11-01'
      GROUP BY from_date::date, to_date::date
      ORDER BY from_date::date, to_date::date
      LIMIT 10;
    `;

    const octResults = await db.query(octoberQuery);
    console.table(octResults.rows);

    console.log('\n' + '='.repeat(80));
    console.log('4. CHECK FOR MULTI-DAY ENTRIES (these are bad!)');
    console.log('='.repeat(80));

    const multiDayQuery = `
      SELECT
        from_date::date as start_date,
        to_date::date as end_date,
        EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as period_days,
        COUNT(*) as affected_users
      FROM user_login_time
      WHERE from_date >= '2025-11-01'
        AND EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 > 1
      GROUP BY from_date::date, to_date::date
      ORDER BY from_date::date;
    `;

    const multiResults = await db.query(multiDayQuery);
    if (multiResults.rows.length > 0) {
      console.log('⚠️  Found multi-day entries:');
      console.table(multiResults.rows);
    } else {
      console.log('✅ No multi-day entries found (good!)');
    }

    console.log('\n' + '='.repeat(80));
    console.log('5. MISSING DAYS CHECK');
    console.log('='.repeat(80));

    // Get all distinct days in November
    const daysQuery = `
      SELECT DISTINCT from_date::date as day
      FROM user_login_time
      WHERE from_date >= '2025-11-01' AND from_date < '2025-12-01'
      ORDER BY day;
    `;

    const daysResults = await db.query(daysQuery);
    const daysInDb = daysResults.rows.map(r => r.day.toISOString().split('T')[0]);

    // Generate expected days
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const currentDay = new Date('2025-11-01T00:00:00Z');
    const expectedDays = [];

    while (currentDay < today && currentDay < new Date('2025-12-01T00:00:00Z')) {
      expectedDays.push(currentDay.toISOString().split('T')[0]);
      currentDay.setUTCDate(currentDay.getUTCDate() + 1);
    }

    const missingDays = expectedDays.filter(d => !daysInDb.includes(d));

    console.log(`Expected days: ${expectedDays.length}`);
    console.log(`Days in DB: ${daysInDb.length}`);
    console.log(`Days in DB: ${daysInDb.join(', ')}`);

    if (missingDays.length > 0) {
      console.log(`\n⚠️  MISSING DAYS (${missingDays.length}): ${missingDays.join(', ')}`);
    } else {
      console.log('\n✅ All expected days are in DB');
    }

    await db.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugNovemberData();
