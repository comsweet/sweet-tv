/**
 * Test /users/{userId}/loginTime with timestamp filter
 *
 * API docs say: "Can only be filtered by timestamp"
 * We've been using wrong field names! Let's try "timestamp" with $gt/$lt
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function testTimestampFilter() {
  console.log('🧪 Testing /loginTime with TIMESTAMP filter (from API docs)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test for Nov 1-7 (past week)
  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📝 Requesting: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);
  console.log(`   User ID: ${testUserId}\n`);

  try {
    // Use "timestamp" field as API docs specify
    const filters = {
      "timestamp": {
        "$gt": fromDate.toISOString(),
        "$lt": toDate.toISOString()
      }
    };

    console.log(`📤 API Request:`);
    console.log(`   GET /users/${testUserId}/loginTime`);
    console.log(`   filters=${JSON.stringify(filters, null, 2)}\n`);

    const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        filters: JSON.stringify(filters)
      }
    });

    console.log(`✅ Response:`, JSON.stringify(response, null, 2));

    const actualFrom = new Date(response.fromDate);
    const actualTo = new Date(response.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));

    console.log(`\n📊 Analysis:`);
    console.log(`   We asked for:  ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);
    console.log(`   We received:   ${actualFrom.toISOString().split('T')[0]} → ${actualTo.toISOString().split('T')[0]}`);
    console.log(`   Days returned: ${daysDiff}`);
    console.log(`   Login time:    ${(parseInt(response.loginSeconds) / 3600).toFixed(2)} hours\n`);

    if (actualFrom.toISOString().split('T')[0] === fromDate.toISOString().split('T')[0]) {
      console.log(`✅ SUCCESS! Timestamp filter works!`);
      console.log(`   We got the EXACT dates we asked for!`);
      console.log(`   This means we CAN get historical data!\n`);
      return true;
    } else {
      console.log(`❌ Still not working. API returned different dates.\n`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error:`, error.message);
    return false;
  }
}

async function testMultipleChunksWithTimestamp() {
  console.log('\n🧪 Testing multiple chunks with timestamp filter');
  console.log('═══════════════════════════════════════════════════════\n');

  const chunks = [
    { from: '2025-11-01', to: '2025-11-07' },
    { from: '2025-11-08', to: '2025-11-14' },
    { from: '2025-11-15', to: '2025-11-21' },
    { from: '2025-11-22', to: '2025-11-28' },
  ];

  console.log(`📝 Requesting 4 chunks to cover Nov 1-28:\n`);

  let totalSeconds = 0;
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fromDate = new Date(`${chunk.from}T00:00:00Z`);
    const toDate = new Date(`${chunk.to}T23:59:59Z`);

    console.log(`   Chunk ${i + 1}: ${chunk.from} → ${chunk.to}`);

    try {
      const filters = {
        "timestamp": {
          "$gt": fromDate.toISOString(),
          "$lt": toDate.toISOString()
        }
      };

      const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
        method: 'GET',
        params: {
          filters: JSON.stringify(filters)
        }
      });

      const actualFrom = new Date(response.fromDate).toISOString().split('T')[0];
      const actualTo = new Date(response.toDate).toISOString().split('T')[0];
      const loginHours = (parseInt(response.loginSeconds) / 3600).toFixed(2);
      const loginSeconds = parseInt(response.loginSeconds);

      console.log(`      → API returned: ${actualFrom} → ${actualTo} (${loginHours}h)`);

      totalSeconds += loginSeconds;
      results.push({
        requested: `${chunk.from} → ${chunk.to}`,
        received: `${actualFrom} → ${actualTo}`,
        hours: parseFloat(loginHours),
        seconds: loginSeconds
      });

      // Small delay to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.log(`      → Error: ${error.message}`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total login time: ${totalSeconds} seconds (${(totalSeconds / 3600).toFixed(2)} hours)`);
  console.log();

  // Check if we got different data for each chunk
  const uniqueDates = new Set(results.map(r => r.received));

  if (uniqueDates.size === 1) {
    console.log(`❌ All chunks returned SAME dates (${[...uniqueDates][0]})`);
    console.log(`   API is ignoring timestamp filter!\n`);
  } else {
    console.log(`✅ Got DIFFERENT dates for each chunk!`);
    console.log(`   Timestamp filter works! We can build full month data!\n`);

    console.log(`📋 Details:`);
    results.forEach((r, i) => {
      console.log(`   Chunk ${i + 1}: ${r.requested}`);
      console.log(`      → Got: ${r.received} (${r.hours}h)`);
    });
  }
}

async function runTests() {
  const filterWorked = await testTimestampFilter();

  if (filterWorked) {
    await testMultipleChunksWithTimestamp();
  } else {
    console.log(`\n⚠️  Timestamp filter didn't work either.`);
    console.log(`   We need to use /sessions endpoint instead.\n`);
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
