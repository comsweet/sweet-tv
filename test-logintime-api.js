/**
 * Test script to check different ways to call Adversus loginTime API
 *
 * Testing 3 approaches:
 * 1. Query params (fromDate/toDate) - what we currently use
 * 2. Filters parameter - like other endpoints
 * 3. Different parameter names
 */

const axios = require('axios');
require('dotenv').config();

const ADVERSUS_API_KEY = process.env.ADVERSUS_API_KEY;
const ADVERSUS_API_URL = process.env.ADVERSUS_API_URL || 'https://api.adversus.io/v1';

const testUserId = '236442'; // Use the user ID from your test
const fromDate = '2025-11-01T00:00:00Z';
const toDate = '2025-11-30T23:59:59Z';

async function test1_QueryParams() {
  console.log('\n📝 TEST 1: Query params (fromDate/toDate) - Current approach');
  console.log(`   URL: ${ADVERSUS_API_URL}/users/${testUserId}/loginTime`);
  console.log(`   Params: fromDate=${fromDate}, toDate=${toDate}`);

  try {
    const response = await axios.get(`${ADVERSUS_API_URL}/users/${testUserId}/loginTime`, {
      headers: { 'api-key': ADVERSUS_API_KEY },
      params: {
        fromDate,
        toDate
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response.data, null, 2));

    const actualFrom = new Date(response.data.fromDate);
    const actualTo = new Date(response.data.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
  } catch (error) {
    console.error('   ❌ Error:', error.response?.data || error.message);
  }
}

async function test2_FiltersParam() {
  console.log('\n📝 TEST 2: Using filters parameter (like /leads endpoint)');

  const filters = JSON.stringify({
    "startTime": {
      "$gt": fromDate,
      "$lt": toDate
    }
  });

  console.log(`   URL: ${ADVERSUS_API_URL}/users/${testUserId}/loginTime`);
  console.log(`   Params: filters=${filters}`);

  try {
    const response = await axios.get(`${ADVERSUS_API_URL}/users/${testUserId}/loginTime`, {
      headers: { 'api-key': ADVERSUS_API_KEY },
      params: {
        filters
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response.data, null, 2));

    const actualFrom = new Date(response.data.fromDate);
    const actualTo = new Date(response.data.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
  } catch (error) {
    console.error('   ❌ Error:', error.response?.data || error.message);
  }
}

async function test3_AlternativeParams() {
  console.log('\n📝 TEST 3: Alternative parameter names');
  console.log(`   URL: ${ADVERSUS_API_URL}/users/${testUserId}/loginTime`);
  console.log(`   Params: startDate/endDate instead of fromDate/toDate`);

  try {
    const response = await axios.get(`${ADVERSUS_API_URL}/users/${testUserId}/loginTime`, {
      headers: { 'api-key': ADVERSUS_API_KEY },
      params: {
        startDate: fromDate,
        endDate: toDate
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response.data, null, 2));

    const actualFrom = new Date(response.data.fromDate);
    const actualTo = new Date(response.data.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
  } catch (error) {
    console.error('   ❌ Error:', error.response?.data || error.message);
  }
}

async function test4_CombinedParams() {
  console.log('\n📝 TEST 4: Both fromDate/toDate AND filters');

  const filters = JSON.stringify({
    "fromDate": {
      "$eq": fromDate
    },
    "toDate": {
      "$eq": toDate
    }
  });

  console.log(`   URL: ${ADVERSUS_API_URL}/users/${testUserId}/loginTime`);
  console.log(`   Params: fromDate=${fromDate}, toDate=${toDate}, filters=${filters}`);

  try {
    const response = await axios.get(`${ADVERSUS_API_URL}/users/${testUserId}/loginTime`, {
      headers: { 'api-key': ADVERSUS_API_KEY },
      params: {
        fromDate,
        toDate,
        filters
      }
    });

    console.log('   ✅ Response:', JSON.stringify(response.data, null, 2));

    const actualFrom = new Date(response.data.fromDate);
    const actualTo = new Date(response.data.toDate);
    const daysDiff = Math.ceil((actualTo - actualFrom) / (1000 * 60 * 60 * 24));
    console.log(`   📊 Returned ${daysDiff} days of data`);
  } catch (error) {
    console.error('   ❌ Error:', error.response?.data || error.message);
  }
}

async function runAllTests() {
  console.log('🧪 Testing Adversus /users/{userId}/loginTime API');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`User ID: ${testUserId}`);
  console.log(`Date range: ${fromDate} → ${toDate} (30 days)`);
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
