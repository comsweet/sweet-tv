/**
 * Test script to check if Adversus API returns data for Nov 3
 * Run: node backend/test_nov3_data.js
 */

const AdversusAPI = require('./services/adversusAPI');
const db = require('./services/postgres');

async function testNov3Data() {
  try {
    await db.init();
    const adversusAPI = new AdversusAPI();

    console.log('=' .repeat(80));
    console.log('TESTING NOV 3 DATA FROM ADVERSUS API');
    console.log('='.repeat(80));

    const nov3Start = new Date('2025-11-03T00:00:00.000Z');
    const nov3End = new Date('2025-11-03T23:59:59.999Z');

    console.log('\n📅 Requesting data for:');
    console.log(`   Start: ${nov3Start.toISOString()}`);
    console.log(`   End: ${nov3End.toISOString()}`);

    console.log('\n🏭 Calling Adversus workforce API...');
    const response = await adversusAPI.request('/workforce/buildReport', {
      method: 'POST',
      data: {
        start: nov3Start.toISOString(),
        end: nov3End.toISOString()
      }
    });

    // Parse response
    let records = [];
    if (typeof response === 'string') {
      const lines = response.trim().split('\n');
      records = lines.map(line => JSON.parse(line)).filter(r => r !== null);
    } else if (Array.isArray(response)) {
      records = response;
    } else {
      console.error('Unexpected response format:', typeof response);
      return;
    }

    console.log(`\n✅ Got ${records.length} records from API`);

    if (records.length > 0) {
      console.log('\nFirst 5 users:');
      records.slice(0, 5).forEach(r => {
        const loginSeconds = r.timeWorked || 0;
        const hours = (loginSeconds / 3600).toFixed(2);
        console.log(`  User ${r.userId}: ${loginSeconds}s (${hours}h)`);
      });

      // Calculate total
      const totalSeconds = records.reduce((sum, r) => sum + (r.timeWorked || 0), 0);
      const totalHours = (totalSeconds / 3600).toFixed(2);
      console.log(`\n📊 Total login time: ${totalSeconds}s (${totalHours}h)`);
      console.log(`   Average per user: ${(totalSeconds / records.length / 3600).toFixed(2)}h`);
    } else {
      console.log('\n⚠️  NO DATA RETURNED FROM API!');
      console.log('   This explains why Nov 3 shows 0h in the database.');
    }

    // Check what's in database
    console.log('\n' + '='.repeat(80));
    console.log('CHECKING DATABASE FOR NOV 3');
    console.log('='.repeat(80));

    const dbQuery = `
      SELECT
        COUNT(DISTINCT user_id) as user_count,
        SUM(login_seconds) as total_login_seconds,
        AVG(login_seconds) as avg_login_seconds,
        MIN(login_seconds) as min_login_seconds,
        MAX(login_seconds) as max_login_seconds
      FROM user_login_time
      WHERE from_date = $1 AND to_date = $2
    `;

    const dbResult = await db.query(dbQuery, [
      nov3Start.toISOString(),
      nov3End.toISOString()
    ]);

    const dbData = dbResult.rows[0];
    console.log(`\nDatabase stats for Nov 3:`);
    console.log(`  Users: ${dbData.user_count}`);
    console.log(`  Total: ${dbData.total_login_seconds}s (${(dbData.total_login_seconds / 3600).toFixed(2)}h)`);
    console.log(`  Avg: ${(dbData.avg_login_seconds / 3600).toFixed(2)}h/user`);
    console.log(`  Min: ${dbData.min_login_seconds}s`);
    console.log(`  Max: ${dbData.max_login_seconds}s`);

    if (parseInt(dbData.user_count) !== records.length) {
      console.log(`\n⚠️  MISMATCH!`);
      console.log(`   API returned ${records.length} users`);
      console.log(`   DB has ${dbData.user_count} users`);
    }

    await db.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testNov3Data();
