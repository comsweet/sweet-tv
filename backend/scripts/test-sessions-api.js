/**
 * Test /sessions endpoint to calculate login time manually
 *
 * Since /loginTime only returns last 7 days from NOW (ignoring our dates),
 * we need to use /sessions and calculate total login time ourselves.
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function testSessions() {
  console.log('🧪 Testing /sessions endpoint to calculate login time');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test for Nov 1-7 (past week)
  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📝 Requesting sessions for: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);
  console.log(`   User ID: ${testUserId}\n`);

  try {
    // Try fetching sessions with filters
    const filters = {
      "userId": { "$eq": testUserId },
      "startTime": {
        "$gt": fromDate.toISOString(),
        "$lt": toDate.toISOString()
      }
    };

    console.log(`📤 API Request:`);
    console.log(`   GET /sessions`);
    console.log(`   filters=${JSON.stringify(filters, null, 2)}`);
    console.log(`   includeMeta=true`);
    console.log(`   pageSize=100\n`);

    const response = await adversusAPI.request('/sessions', {
      method: 'GET',
      params: {
        filters: JSON.stringify(filters),
        includeMeta: true,
        pageSize: 100,
        sortProperty: 'startTime',
        sortDirection: 'ASC'
      }
    });

    console.log(`✅ Response received!\n`);

    // Check if we have sessions data
    if (response.sessions && Array.isArray(response.sessions)) {
      const sessions = response.sessions;
      console.log(`📊 Found ${sessions.length} sessions\n`);

      if (sessions.length > 0) {
        console.log(`📋 First 5 sessions (sample):\n`);
        sessions.slice(0, 5).forEach((session, i) => {
          console.log(`   ${i + 1}. Session ID: ${session.id || 'N/A'}`);
          console.log(`      Start: ${session.startTime || 'N/A'}`);
          console.log(`      End: ${session.endTime || 'N/A'}`);
          console.log(`      Duration: ${session.duration || 'N/A'} seconds`);
          console.log(`      User: ${session.userId || 'N/A'}`);
          console.log();
        });

        // Calculate total login time
        let totalSeconds = 0;
        let validSessions = 0;

        sessions.forEach(session => {
          if (session.duration && !isNaN(parseInt(session.duration))) {
            totalSeconds += parseInt(session.duration);
            validSessions++;
          } else if (session.startTime && session.endTime) {
            // Calculate duration from start/end if duration field is missing
            const start = new Date(session.startTime);
            const end = new Date(session.endTime);
            const durationSec = Math.floor((end - start) / 1000);
            if (durationSec > 0) {
              totalSeconds += durationSec;
              validSessions++;
            }
          }
        });

        console.log(`\n🎯 RESULTS:`);
        console.log(`   Total sessions: ${sessions.length}`);
        console.log(`   Valid sessions with duration: ${validSessions}`);
        console.log(`   Total login time: ${totalSeconds} seconds`);
        console.log(`   Total login time: ${(totalSeconds / 3600).toFixed(2)} hours`);
        console.log(`   Average session: ${(totalSeconds / validSessions / 60).toFixed(1)} minutes\n`);

        // Check pagination
        if (response.meta && response.meta.pagination) {
          const pagination = response.meta.pagination;
          console.log(`📄 Pagination info:`);
          console.log(`   Page: ${pagination.page}/${pagination.pageCount}`);
          console.log(`   Total records: ${pagination.total}`);
          console.log(`   Page size: ${pagination.pageSize}\n`);

          if (pagination.total > pagination.pageSize) {
            console.log(`⚠️  NOTE: There are ${pagination.total} total sessions!`);
            console.log(`   We only fetched ${pagination.pageSize} on this page.`);
            console.log(`   Need to fetch all pages to get complete data.\n`);
          }
        }

        console.log(`\n✅ SUCCESS! We can calculate login time from sessions!`);
        console.log(`   This approach will work for ANY date range!`);

      } else {
        console.log(`⚠️  No sessions found for this date range.`);
        console.log(`   This could mean:`);
        console.log(`   1. User had no sessions during Nov 1-7`);
        console.log(`   2. API doesn't support historical sessions`);
        console.log(`   3. Filters syntax is wrong\n`);
      }

    } else {
      console.log(`❌ Unexpected response format:`);
      console.log(JSON.stringify(response, null, 2));
    }

  } catch (error) {
    console.error(`\n❌ Error fetching sessions:`, error.message);
    console.error(`   Response data:`, error.response?.data);
  }
}

async function testSessionsAlternative() {
  console.log('\n\n🧪 Testing alternative /sessions parameters');
  console.log('═══════════════════════════════════════════════════════\n');

  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📝 Test 2: Using different filter field names\n`);

  try {
    // Maybe it's called "user" instead of "userId"?
    const filters = {
      "user": { "$eq": testUserId },
      "date": {
        "$gt": fromDate.toISOString(),
        "$lt": toDate.toISOString()
      }
    };

    console.log(`   Trying filters: ${JSON.stringify(filters)}\n`);

    const response = await adversusAPI.request('/sessions', {
      method: 'GET',
      params: {
        filters: JSON.stringify(filters),
        pageSize: 10
      }
    });

    console.log(`   Response:`, response.sessions ? `${response.sessions.length} sessions` : 'No sessions field');

  } catch (error) {
    console.error(`   Error:`, error.message);
  }
}

async function runTests() {
  await testSessions();
  await testSessionsAlternative();

  console.log('\n═══════════════════════════════════════════════════════\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
