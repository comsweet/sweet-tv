/**
 * Test script to check different ways to call Adversus loginTime API
 *
 * Testing 3 approaches:
 * 1. Query params (fromDate/toDate) - what we currently use
 * 2. Filters parameter - like other endpoints
 * 3. Different parameter names
 */

const adversusAPI = require('../services/adversusAPI');

const testUserId = '236442'; // Use the user ID from your test
const fromDate = new Date('2025-11-01T00:00:00Z');
const toDate = new Date('2025-11-30T23:59:59Z');

async function test1_QueryParams() {
  console.log('\n📝 TEST 1: Query params (fromDate/toDate) - Current approach');
  console.log(`   Params: fromDate=${fromDate.toISOString()}, toDate=${toDate.toISOString()}`);

  try {
    const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response, null, 2));

    const actualFrom = new Date(response.fromDate);
    const actualTo = new Date(response.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
    console.log(`   📅 Actual range: ${actualFrom.toISOString().split('T')[0]} → ${actualTo.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

async function test2_FiltersParam() {
  console.log('\n📝 TEST 2: Using filters parameter (like /leads endpoint)');

  const filters = {
    "startTime": {
      "$gt": fromDate.toISOString(),
      "$lt": toDate.toISOString()
    }
  };

  console.log(`   Params: filters=${JSON.stringify(filters)}`);

  try {
    const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        filters: JSON.stringify(filters)
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response, null, 2));

    const actualFrom = new Date(response.fromDate);
    const actualTo = new Date(response.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
    console.log(`   📅 Actual range: ${actualFrom.toISOString().split('T')[0]} → ${actualTo.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

async function test3_AlternativeParams() {
  console.log('\n📝 TEST 3: Alternative parameter names');
  console.log(`   Params: startDate/endDate instead of fromDate/toDate`);

  try {
    const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        startDate: fromDate.toISOString(),
        endDate: toDate.toISOString()
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response, null, 2));

    const actualFrom = new Date(response.fromDate);
    const actualTo = new Date(response.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
    console.log(`   📅 Actual range: ${actualFrom.toISOString().split('T')[0]} → ${actualTo.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

async function test4_CombinedParams() {
  console.log('\n📝 TEST 4: Both fromDate/toDate AND filters');

  const filters = {
    "fromDate": {
      "$eq": fromDate.toISOString()
    },
    "toDate": {
      "$eq": toDate.toISOString()
    }
  };

  console.log(`   Params: fromDate + toDate + filters`);

  try {
    const response = await adversusAPI.request(`/users/${testUserId}/loginTime`, {
      method: 'GET',
      params: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        filters: JSON.stringify(filters)
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response, null, 2));

    const actualFrom = new Date(response.fromDate);
    const actualTo = new Date(response.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
    console.log(`   📅 Actual range: ${actualFrom.toISOString().split('T')[0]} → ${actualTo.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

async function runAllTests() {
  console.log('🧪 Testing Adversus /users/{userId}/loginTime API');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`User ID: ${testUserId}`);
  console.log(`Date range: ${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]} (30 days)`);
  console.log('═══════════════════════════════════════════════════════');

  await test1_QueryParams();
  await test2_FiltersParam();
  await test3_AlternativeParams();
  await test4_CombinedParams();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🎯 CONCLUSION:');
  console.log('   If all tests return only 7 days, the API has a hard limit.');
  console.log('   If any test returns 30 days, we found the right way!');
  console.log('═══════════════════════════════════════════════════════\n');
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
