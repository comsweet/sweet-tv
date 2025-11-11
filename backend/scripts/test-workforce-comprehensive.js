/**
 * COMPREHENSIVE TEST for /workforce/buildReport
 *
 * Will test EVERY possible combination until we find what works
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function comprehensiveTest() {
  console.log('🔬 COMPREHENSIVE TEST: /workforce/buildReport');
  console.log('═══════════════════════════════════════════════════════\n');

  // Use recent dates (today and yesterday) in case future dates cause issues
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const yesterdayStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0, 0));

  console.log(`Testing date ranges:`);
  console.log(`  Today: ${todayStart.toISOString().split('T')[0]}`);
  console.log(`  Yesterday: ${yesterdayStart.toISOString().split('T')[0]}`);
  console.log();

  const testCases = [
    // Test 1: Exact format from user's example
    {
      name: 'User example format (int userId, recent dates)',
      body: {
        startTime: yesterdayStart.toISOString(),
        endTime: todayEnd.toISOString(),
        userId: parseInt(testUserId)
      }
    },

    // Test 2: String userId
    {
      name: 'String userId',
      body: {
        startTime: yesterdayStart.toISOString(),
        endTime: todayEnd.toISOString(),
        userId: testUserId
      }
    },

    // Test 3: Just today
    {
      name: 'Just today (same start/end date)',
      body: {
        startTime: todayStart.toISOString(),
        endTime: todayEnd.toISOString(),
        userId: parseInt(testUserId)
      }
    },

    // Test 4: No userId (all users)
    {
      name: 'No userId (all users)',
      body: {
        startTime: todayStart.toISOString(),
        endTime: todayEnd.toISOString()
      }
    },

    // Test 5: Different field names (from/to instead of start/end)
    {
      name: 'fromTime/toTime instead',
      body: {
        fromTime: yesterdayStart.toISOString(),
        toTime: todayEnd.toISOString(),
        userId: parseInt(testUserId)
      }
    },

    // Test 6: date format without milliseconds
    {
      name: 'Date format without .000Z',
      body: {
        startTime: yesterdayStart.toISOString().replace('.000Z', 'Z'),
        endTime: todayEnd.toISOString().replace('.000Z', 'Z'),
        userId: parseInt(testUserId)
      }
    },

    // Test 7: user instead of userId
    {
      name: 'user field instead of userId',
      body: {
        startTime: yesterdayStart.toISOString(),
        endTime: todayEnd.toISOString(),
        user: parseInt(testUserId)
      }
    },

    // Test 8: users array
    {
      name: 'users array',
      body: {
        startTime: yesterdayStart.toISOString(),
        endTime: todayEnd.toISOString(),
        users: [parseInt(testUserId)]
      }
    },

    // Test 9: With filters object (nested)
    {
      name: 'Nested in filters',
      body: {
        filters: {
          startTime: yesterdayStart.toISOString(),
          endTime: todayEnd.toISOString(),
          userId: parseInt(testUserId)
        }
      }
    },

    // Test 10: Empty body (maybe it returns all?)
    {
      name: 'Empty body',
      body: {}
    },

    // Test 11: date strings in Swedish locale format
    {
      name: 'Swedish date format',
      body: {
        startTime: yesterdayStart.toLocaleString('sv-SE'),
        endTime: todayEnd.toLocaleString('sv-SE'),
        userId: parseInt(testUserId)
      }
    },

    // Test 12: Unix timestamps
    {
      name: 'Unix timestamps (seconds)',
      body: {
        startTime: Math.floor(yesterdayStart.getTime() / 1000),
        endTime: Math.floor(todayEnd.getTime() / 1000),
        userId: parseInt(testUserId)
      }
    },

    // Test 13: Lowercase field names
    {
      name: 'Lowercase starttime/endtime',
      body: {
        starttime: yesterdayStart.toISOString(),
        endtime: todayEnd.toISOString(),
        userid: parseInt(testUserId)
      }
    },

    // Test 14: With groupBy parameter
    {
      name: 'With groupBy user',
      body: {
        startTime: yesterdayStart.toISOString(),
        endTime: todayEnd.toISOString(),
        userId: parseInt(testUserId),
        groupBy: 'user'
      }
    },

    // Test 15: Last 24 hours from now
    {
      name: 'Last 24 hours from now',
      body: {
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date().toISOString(),
        userId: parseInt(testUserId)
      }
    }
  ];

  let successfulTest = null;

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n📤 Test ${i + 1}/${testCases.length}: ${test.name}`);
    console.log(`   Body: ${JSON.stringify(test.body, null, 2)}\n`);

    try {
      const response = await adversusAPI.request('/workforce/buildReport', {
        method: 'POST',
        data: test.body
      });

      console.log(`✅✅✅ SUCCESS! This format works!`);
      console.log(`Response type: ${Array.isArray(response) ? 'Array' : typeof response}`);

      if (Array.isArray(response)) {
        console.log(`Found ${response.length} records`);
        if (response.length > 0) {
          console.log(`Sample record:`, JSON.stringify(response[0], null, 2));

          // Calculate total
          const total = response.reduce((sum, r) => sum + parseFloat(r.duration || 0), 0);
          console.log(`Total duration: ${total.toFixed(2)}s (${(total / 3600).toFixed(2)}h)`);
        }
      } else {
        console.log(`Response:`, JSON.stringify(response, null, 2));
      }

      successfulTest = {
        testNumber: i + 1,
        name: test.name,
        body: test.body,
        response: response
      };

      console.log(`\n🎉 FOUND IT! Test ${i + 1} worked!`);
      break;

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      if (error.response?.data) {
        console.log(`   Response:`, JSON.stringify(error.response.data));
      }
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n═══════════════════════════════════════════════════════');

  if (successfulTest) {
    console.log('🎉 SUCCESS! Found working format:');
    console.log(JSON.stringify(successfulTest.body, null, 2));
  } else {
    console.log('❌ ALL TESTS FAILED');
    console.log('\nPossible reasons:');
    console.log('  1. API endpoint requires different authentication');
    console.log('  2. User account lacks permissions for workforce reports');
    console.log('  3. Feature not available in this Adversus plan');
    console.log('  4. API documentation is incorrect/outdated');
    console.log('  5. Endpoint URL is wrong');
    console.log('\nNext steps:');
    console.log('  - Contact Adversus support');
    console.log('  - Check account permissions in Adversus UI');
    console.log('  - Try endpoint in Adversus API explorer if available');
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

comprehensiveTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
