/**
 * Test to see what happens when we request PAST date ranges
 * If API always returns "last 7 days from now", we can't get historical data
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442';

async function testPastWeek() {
  console.log('🧪 Testing if we can get PAST week (Nov 1-7)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Request Nov 1-7 (in the past)
  const fromDate = new Date('2025-11-01T00:00:00Z');
  const toDate = new Date('2025-11-07T23:59:59Z');

  console.log(`📝 Requesting: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]} (7 days in the PAST)`);

  try {
    const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      }
    });

    console.log('\n✅ Response:', JSON.stringify(response, null, 2));

    const actualFrom = new Date(response.fromDate);
    const actualTo = new Date(response.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));

    console.log(`\n📊 Analysis:`);
    console.log(`   We asked for:  ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`);
    console.log(`   We received:   ${actualFrom.toISOString().split('T')[0]} → ${actualTo.toISOString().split('T')[0]}`);
    console.log(`   Days returned: ${daysDiff}`);

    if (actualFrom.toISOString().split('T')[0] === fromDate.toISOString().split('T')[0]) {
      console.log('\n✅ SUCCESS! API returned the PAST dates we requested!');
      console.log('   This means we CAN get historical data, just limited to 7-day chunks.');
      console.log('   Our chunking solution will work perfectly!');
    } else {
      console.log('\n❌ PROBLEM! API ignored our dates and returned recent dates instead.');
      console.log('   This means API always returns "last 7 days from NOW"');
      console.log('   We CANNOT get historical data at all!');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

async function testMultipleChunks() {
  console.log('\n\n🧪 Testing multiple chunks to build up a month');
  console.log('═══════════════════════════════════════════════════════\n');

  const chunks = [
    { from: '2025-11-01', to: '2025-11-07' },
    { from: '2025-11-08', to: '2025-11-14' },
    { from: '2025-11-15', to: '2025-11-21' },
    { from: '2025-11-22', to: '2025-11-28' },
  ];

  console.log('📝 Requesting 4 chunks to cover Nov 1-28:\n');

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fromDate = new Date(`${chunk.from}T00:00:00Z`);
    const toDate = new Date(`${chunk.to}T23:59:59Z`);

    console.log(`   Chunk ${i + 1}: ${chunk.from} → ${chunk.to}`);

    try {
      const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
        method: 'GET',
        params: {
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString()
        }
      });

      const actualFrom = new Date(response.fromDate).toISOString().split('T')[0];
      const actualTo = new Date(response.toDate).toISOString().split('T')[0];
      const loginHours = (parseInt(response.loginSeconds) / 3600).toFixed(2);

      console.log(`      → API returned: ${actualFrom} → ${actualTo} (${loginHours}h)`);

      // Small delay to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.log(`      → Error: ${error.message}`);
    }
  }

  console.log('\n🎯 If all chunks return DIFFERENT dates, we can build the full month!');
  console.log('   If all chunks return SAME dates, API is broken for historical data.');
}

async function runTests() {
  await testPastWeek();
  await testMultipleChunks();

  console.log('\n═══════════════════════════════════════════════════════\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
