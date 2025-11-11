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

  // Try different body structures
  const testBodies = [
    {
      name: 'Test 1: Basic filters',
      body: {
        filters: {
          userId: testUserId,
          timestamp: {
            $gt: fromDate.toISOString(),
            $lt: toDate.toISOString()
          }
        }
      }
    },
    {
      name: 'Test 2: Date range format',
      body: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        userId: testUserId
      }
    },
    {
      name: 'Test 3: Alternative structure',
      body: {
        users: [testUserId],
        startDate: fromDate.toISOString(),
        endDate: toDate.toISOString()
      }
    },
    {
      name: 'Test 4: With groupBy',
      body: {
        filters: {
          userId: testUserId,
          date: {
            $gte: fromDate.toISOString(),
            $lte: toDate.toISOString()
          }
        },
        groupBy: 'user'
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
      console.log(JSON.stringify(response, null, 2));
      console.log();

      // If response has time fields, sum them up
      if (response) {
        const timeFields = ['active', 'paused', 'processing', 'waiting', 'dialing', 'talking', 'idle'];
        let totalSeconds = 0;
        const breakdown = {};

        timeFields.forEach(field => {
          if (response[field] !== undefined && !isNaN(parseInt(response[field]))) {
            const seconds = parseInt(response[field]);
            breakdown[field] = seconds;
            totalSeconds += seconds;
          }
        });

        if (Object.keys(breakdown).length > 0) {
          console.log(`📊 Time Breakdown:`);
          Object.entries(breakdown).forEach(([field, seconds]) => {
            console.log(`   ${field}: ${seconds}s (${(seconds / 3600).toFixed(2)}h)`);
          });
          console.log(`   TOTAL: ${totalSeconds}s (${(totalSeconds / 3600).toFixed(2)}h)\n`);
        }
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
