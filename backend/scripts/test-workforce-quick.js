/**
 * Quick test with correct field names: start/end (not startTime/endTime)
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function quickTest() {
  console.log('🧪 Testing with START and END (not startTime/endTime)');
  console.log('═══════════════════════════════════════════════════════\n');

  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  const testCases = [
    {
      name: 'Test 1: start/end with userId',
      body: {
        start: fromDate.toISOString(),
        end: toDate.toISOString(),
        userId: parseInt(testUserId)
      }
    },
    {
      name: 'Test 2: start/end without userId (all users)',
      body: {
        start: fromDate.toISOString(),
        end: toDate.toISOString()
      }
    },
    {
      name: 'Test 3: start/end with string userId',
      body: {
        start: fromDate.toISOString(),
        end: toDate.toISOString(),
        userId: testUserId
      }
    }
  ];

  for (const test of testCases) {
    console.log(`\n📤 ${test.name}:`);
    console.log(`   Body: ${JSON.stringify(test.body, null, 2)}\n`);

    try {
      const response = await adversusAPI.request('/workforce/buildReport', {
        method: 'POST',
        data: test.body
      });

      console.log(`✅✅✅ SUCCESS! Found working format!\n`);

      if (Array.isArray(response)) {
        console.log(`📊 Found ${response.length} activity records\n`);

        if (response.length > 0) {
          console.log(`Sample records (first 5):`);
          response.slice(0, 5).forEach((record, i) => {
            console.log(`   ${i + 1}. userid: ${record.userid}, activity: ${record.activity}, duration: ${record.duration}s, campaign: ${record.campaignid || 'N/A'}`);
          });
          console.log();

          // Group by activity
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
          Object.entries(activityBreakdown).sort((a, b) => b[1] - a[1]).forEach(([activity, seconds]) => {
            console.log(`   ${activity.padEnd(15)}: ${seconds.toFixed(2).padStart(10)}s  (${(seconds / 3600).toFixed(2)}h)`);
          });
          console.log(`   ${'═'.repeat(50)}`);
          console.log(`   ${'TOTAL'.padEnd(15)}: ${totalSeconds.toFixed(2).padStart(10)}s  (${(totalSeconds / 3600).toFixed(2)}h)\n`);

          // Filter for specific user
          const userRecords = response.filter(r => String(r.userid) === String(testUserId));
          if (userRecords.length > 0) {
            console.log(`👤 Records for user ${testUserId}:`);
            const userTotal = userRecords.reduce((sum, r) => sum + parseFloat(r.duration || 0), 0);
            console.log(`   Sessions: ${userRecords.length}`);
            console.log(`   Total time: ${userTotal.toFixed(2)}s (${(userTotal / 3600).toFixed(2)}h)\n`);

            // User's activity breakdown
            const userActivities = {};
            userRecords.forEach(r => {
              const activity = r.activity || 'unknown';
              const duration = parseFloat(r.duration || 0);
              if (!userActivities[activity]) {
                userActivities[activity] = 0;
              }
              userActivities[activity] += duration;
            });

            console.log(`   Activity breakdown:`);
            Object.entries(userActivities).sort((a, b) => b[1] - a[1]).forEach(([activity, seconds]) => {
              console.log(`      ${activity.padEnd(12)}: ${(seconds / 3600).toFixed(2)}h`);
            });
          }
        }
      } else {
        console.log(`Response:`, JSON.stringify(response, null, 2));
      }

      console.log(`\n🎉 WORKFORCE IS WORKING!\n`);
      return response;

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      if (error.response?.data) {
        console.log(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

quickTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
