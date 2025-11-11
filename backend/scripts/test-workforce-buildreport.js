/**
 * Test /workforce/buildReport endpoint
 *
 * This POST endpoint seems to return detailed workforce metrics:
 * - Active
 * - Paused
 * - Processing
 * - Waiting
 * - Dialing (seconds)
 * - Talking
 *
 * Sum of all = actual login time (more accurate than /loginTime?)
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function testBuildReport() {
  console.log('🧪 Testing /workforce/buildReport endpoint');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test for Nov 1-7
  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📝 Requesting workforce report for: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);
  console.log(`   User ID: ${testUserId}\n`);

  // Try different body structures - parameters at root level, not in filters
  const testBodies = [
    {
      name: 'Test 1: Direct params (correct format per your feedback)',
      body: {
        startTime: fromDate.toISOString(),
        endTime: toDate.toISOString(),
        userId: parseInt(testUserId)
      }
    },
    {
      name: 'Test 2: userId as string',
      body: {
        startTime: fromDate.toISOString(),
        endTime: toDate.toISOString(),
        userId: testUserId
      }
    },
    {
      name: 'Test 3: Without userId (all users)',
      body: {
        startTime: fromDate.toISOString(),
        endTime: toDate.toISOString()
      }
    }
  ];

  for (const test of testBodies) {
    console.log(`\n📤 ${test.name}:`);
    console.log(`   Body: ${JSON.stringify(test.body, null, 2)}\n`);

    try {
      const response = await adversusAPI.request('/workforce/buildReport', {
        method: 'POST',
        data: test.body
      });

      console.log(`✅ Response received!`);

      // Response should be an array of activity records
      if (Array.isArray(response)) {
        console.log(`📊 Found ${response.length} activity records\n`);

        // Show first few records as sample
        console.log(`Sample records:`);
        response.slice(0, 5).forEach((record, i) => {
          console.log(`   ${i + 1}. userid: ${record.userid}, activity: ${record.activity}, duration: ${record.duration}s, campaign: ${record.campaignid || 'N/A'}`);
        });
        console.log();

        // Group by activity and sum durations
        const activityBreakdown = {};
        let totalSeconds = 0;

        response.forEach(record => {
          const activity = record.activity || 'unknown';
          const duration = parseFloat(record.duration || 0);

          if (!activityBreakdown[activity]) {
            activityBreakdown[activity] = 0;
          }
          activityBreakdown[activity] += duration;
          totalSeconds += duration;
        });

        console.log(`📊 Activity Breakdown:`);
        Object.entries(activityBreakdown).forEach(([activity, seconds]) => {
          console.log(`   ${activity}: ${seconds.toFixed(2)}s (${(seconds / 3600).toFixed(2)}h)`);
        });
        console.log(`   ────────────────────────────────────`);
        console.log(`   TOTAL: ${totalSeconds.toFixed(2)}s (${(totalSeconds / 3600).toFixed(2)}h)\n`);

        // Filter for our specific user
        const userRecords = response.filter(r => String(r.userid) === String(testUserId));
        if (userRecords.length > 0) {
          console.log(`📋 Records for user ${testUserId}: ${userRecords.length}`);
          const userTotal = userRecords.reduce((sum, r) => sum + parseFloat(r.duration || 0), 0);
          console.log(`   Total time: ${userTotal.toFixed(2)}s (${(userTotal / 3600).toFixed(2)}h)\n`);
        }

      } else {
        console.log(`Response (not an array):`, JSON.stringify(response, null, 2));
        console.log();
      }

      // Success - no need to test other formats
      return response;

    } catch (error) {
      console.error(`❌ Error:`, error.message);
      if (error.response?.data) {
        console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

async function compareLoginTimeVsWorkforce() {
  console.log('\n\n🧪 Comparing /loginTime vs /workforce/buildReport');
  console.log('═══════════════════════════════════════════════════════\n');

  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📝 Date range: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}\n`);

  // Get loginTime with timestamp filter
  console.log(`📥 Fetching from /loginTime (with timestamp filter)...`);
  try {
    const filters = {
      "timestamp": {
        "$gt": fromDate.toISOString(),
        "$lt": toDate.toISOString()
      }
    };

    const loginTimeResponse = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        filters: JSON.stringify(filters)
      }
    });

    const loginTimeSeconds = parseInt(loginTimeResponse.loginSeconds);
    const loginTimeHours = (loginTimeSeconds / 3600).toFixed(2);

    console.log(`   ✅ loginSeconds: ${loginTimeSeconds}s (${loginTimeHours}h)`);
    console.log(`   Date range: ${loginTimeResponse.fromDate} → ${loginTimeResponse.toDate}\n`);

    // TODO: Compare with workforce data when we know the correct body format
    console.log(`🎯 This is the baseline from /loginTime`);
    console.log(`   If /workforce/buildReport gives more details, we can see the breakdown!`);

  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }
}

async function runTests() {
  await testBuildReport();
  await compareLoginTimeVsWorkforce();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🎯 Next steps:');
  console.log('   If workforce report works, we can use it for more accurate data');
  console.log('   Active + Paused + Processing + Waiting + Dialing + Talking = Total login time');
  console.log('═══════════════════════════════════════════════════════\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
