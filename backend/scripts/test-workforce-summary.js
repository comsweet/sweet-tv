/**
 * Get workforce summary - clean output with breakdown
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function getWorkforceSummary() {
  console.log('📊 WORKFORCE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📅 Period: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);
  console.log(`👤 User ID: ${testUserId}\n`);

  try {
    const response = await adversusAPI.request('/workforce/buildReport', {
      method: 'POST',
      data: {
        start: fromDate.toISOString(),
        end: toDate.toISOString(),
        userId: parseInt(testUserId)
      }
    });

    // Response is NDJSON (newline-delimited JSON) - each line is a separate JSON object
    let records = [];

    if (typeof response === 'string') {
      // Split by newlines and parse each line as JSON
      const lines = response.trim().split('\n');
      records = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.warn('⚠️  Failed to parse line:', line.substring(0, 100));
          return null;
        }
      }).filter(r => r !== null);

      // Filter for our specific user
      records = records.filter(r => r.userid === parseInt(testUserId) || r.userId === parseInt(testUserId));

    } else if (Array.isArray(response)) {
      records = response;
    } else if (response.data && Array.isArray(response.data)) {
      records = response.data;
    } else {
      console.log('⚠️  Unexpected response structure. Showing first 500 chars:');
      console.log(JSON.stringify(response).substring(0, 500));
      console.log('\nFull response type:', typeof response);
      process.exit(1);
    }

    console.log(`✅ Got ${records.length} activity records\n`);

    // Group by activity and sum durations
    const activityMap = {};
    let totalDuration = 0;

    records.forEach(record => {
      const activity = record.activity || 'unknown';
      const duration = parseFloat(record.duration || 0);

      if (!activityMap[activity]) {
        activityMap[activity] = 0;
      }
      activityMap[activity] += duration;
      totalDuration += duration;
    });

    // Display breakdown
    console.log('📊 Activity Breakdown:');
    console.log('─────────────────────────────────────────────────');

    const activities = Object.keys(activityMap).sort();
    const maxActivityLength = Math.max(...activities.map(a => a.length));

    activities.forEach(activity => {
      const seconds = activityMap[activity];
      const hours = (seconds / 3600).toFixed(2);
      const percentage = ((seconds / totalDuration) * 100).toFixed(1);

      const paddedActivity = activity.padEnd(maxActivityLength);
      const paddedSeconds = seconds.toFixed(2).padStart(10);
      const paddedHours = `${hours}h`.padStart(8);
      const paddedPercentage = `${percentage}%`.padStart(6);

      console.log(`   ${paddedActivity}  ${paddedSeconds}s  ${paddedHours}  ${paddedPercentage}`);
    });

    console.log('─────────────────────────────────────────────────');
    const totalHours = (totalDuration / 3600).toFixed(2);
    console.log(`   TOTAL           ${totalDuration.toFixed(2).padStart(10)}s  ${totalHours.padStart(7)}h   100.0%`);
    console.log();

    // Compare with /loginTime
    console.log('🔍 Comparing with /loginTime endpoint:');
    console.log('─────────────────────────────────────────────────');

    try {
      const loginTimeResponse = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
        method: 'GET',
        params: {
          filters: JSON.stringify({
            "timestamp": {
              "$gt": fromDate.toISOString(),
              "$lt": toDate.toISOString()
            }
          })
        }
      });

      const loginSeconds = parseInt(loginTimeResponse.loginSeconds || 0);
      const loginHours = (loginSeconds / 3600).toFixed(2);
      const difference = totalDuration - loginSeconds;
      const diffHours = (difference / 3600).toFixed(2);

      console.log(`   /workforce total:  ${totalDuration.toFixed(2)}s (${totalHours}h)`);
      console.log(`   /loginTime:        ${loginSeconds}s (${loginHours}h)`);
      console.log(`   Difference:        ${difference.toFixed(2)}s (${diffHours}h)`);
      console.log();

      if (Math.abs(difference) < 60) {
        console.log('✅ Both methods match! (difference < 1 minute)');
      } else if (Math.abs(difference) < 600) {
        console.log('✅ Close enough! (difference < 10 minutes)');
      } else {
        console.log('⚠️  Significant difference - workforce likely more accurate');
      }

    } catch (err) {
      console.log('   ⚠️  Could not fetch /loginTime for comparison');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎯 Workforce breakdown gives detailed time allocation!');
    console.log('   Use this for accurate order/h calculations.');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
  }

  process.exit(0);
}

getWorkforceSummary();
