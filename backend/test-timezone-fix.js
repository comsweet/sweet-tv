// Test script to verify Thailand timezone fix
// Run with: node test-timezone-fix.js

function getTodayWindowOLD() {
  // OLD BUGGY VERSION (uses server's local timezone = UTC)
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function getTodayWindowNEW() {
  // NEW FIXED VERSION (uses Thailand timezone = UTC+7)
  const now = new Date();

  // Thailand is UTC+7
  const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;

  // Get current time in Thailand by adding offset to UTC
  const nowThailand = new Date(now.getTime() + THAILAND_OFFSET_MS);

  // Get start of day in Thailand (midnight Thailand time)
  const startThailand = new Date(
    Date.UTC(
      nowThailand.getUTCFullYear(),
      nowThailand.getUTCMonth(),
      nowThailand.getUTCDate(),
      0, 0, 0, 0
    )
  );

  // Get end of day in Thailand (23:59:59.999 Thailand time)
  const endThailand = new Date(
    Date.UTC(
      nowThailand.getUTCFullYear(),
      nowThailand.getUTCMonth(),
      nowThailand.getUTCDate(),
      23, 59, 59, 999
    )
  );

  // Convert back to UTC by subtracting the offset
  const start = new Date(startThailand.getTime() - THAILAND_OFFSET_MS);
  const end = new Date(endThailand.getTime() - THAILAND_OFFSET_MS);

  return { start, end };
}

function formatTime(date) {
  const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;
  const thailandDate = new Date(date.getTime() + THAILAND_OFFSET_MS);

  return {
    utc: date.toISOString(),
    thailand: thailandDate.toISOString().replace('T', ' ').substring(0, 19) + ' (Thailand)'
  };
}

console.log('='.repeat(80));
console.log('TIMEZONE FIX TEST');
console.log('='.repeat(80));

const now = new Date();
const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;
const nowThailand = new Date(now.getTime() + THAILAND_OFFSET_MS);

console.log('\n📅 CURRENT TIME:');
console.log(`   Server (UTC):  ${now.toISOString()}`);
console.log(`   Thailand:      ${nowThailand.toISOString().replace('T', ' ').substring(0, 19)} (UTC+7)`);

console.log('\n🐛 OLD BUGGY VERSION (uses server timezone = UTC):');
const oldWindow = getTodayWindowOLD();
console.log(`   Start: ${oldWindow.start.toISOString()}`);
console.log(`          → Thailand: ${formatTime(oldWindow.start).thailand}`);
console.log(`   End:   ${oldWindow.end.toISOString()}`);
console.log(`          → Thailand: ${formatTime(oldWindow.end).thailand}`);

console.log('\n✅ NEW FIXED VERSION (uses Thailand timezone = UTC+7):');
const newWindow = getTodayWindowNEW();
console.log(`   Start: ${newWindow.start.toISOString()}`);
console.log(`          → Thailand: ${formatTime(newWindow.start).thailand}`);
console.log(`   End:   ${newWindow.end.toISOString()}`);
console.log(`          → Thailand: ${formatTime(newWindow.end).thailand}`);

console.log('\n📊 DIFFERENCE:');
const startDiff = (newWindow.start.getTime() - oldWindow.start.getTime()) / (1000 * 60 * 60);
const endDiff = (newWindow.end.getTime() - oldWindow.end.getTime()) / (1000 * 60 * 60);
console.log(`   Start shifted by: ${startDiff} hours`);
console.log(`   End shifted by:   ${endDiff} hours`);

console.log('\n🔍 SCENARIO TEST:');
console.log('Scenario: Säljare hade 4000 THB igår, la 1000 THB idag kl 14:00 Thailand-tid');
console.log('');

// Simulate a deal created today at 14:00 Thailand time
const todayDealThailand = new Date(nowThailand);
todayDealThailand.setHours(14, 0, 0, 0);
const todayDealUTC = new Date(todayDealThailand.getTime() - THAILAND_OFFSET_MS);

console.log(`Deal created: ${todayDealUTC.toISOString()} (UTC)`);
console.log(`              ${todayDealThailand.toISOString().replace('T', ' ').substring(0, 19)} (Thailand)`);

// Simulate a deal created yesterday at 20:00 Thailand time
const yesterdayThailand = new Date(nowThailand);
yesterdayThailand.setDate(yesterdayThailand.getDate() - 1);
yesterdayThailand.setHours(20, 0, 0, 0);
const yesterdayDealUTC = new Date(yesterdayThailand.getTime() - THAILAND_OFFSET_MS);

console.log(`\nYesterday's deal: ${yesterdayDealUTC.toISOString()} (UTC)`);
console.log(`                  ${yesterdayThailand.toISOString().replace('T', ' ').substring(0, 19)} (Thailand)`);

console.log('\n🐛 OLD VERSION would count:');
const oldIncludes = {
  today: todayDealUTC >= oldWindow.start && todayDealUTC <= oldWindow.end,
  yesterday: yesterdayDealUTC >= oldWindow.start && yesterdayDealUTC <= oldWindow.end
};
console.log(`   Today's deal (1000 THB):    ${oldIncludes.today ? '✅ YES' : '❌ NO'}`);
console.log(`   Yesterday's deal (4000 THB): ${oldIncludes.yesterday ? '🐛 YES (WRONG!)' : '✅ NO'}`);
if (oldIncludes.yesterday) {
  console.log(`   → Total shown: 5000 THB (WRONG! Includes yesterday's 4000 THB)`);
}

console.log('\n✅ NEW VERSION counts:');
const newIncludes = {
  today: todayDealUTC >= newWindow.start && todayDealUTC <= newWindow.end,
  yesterday: yesterdayDealUTC >= newWindow.start && yesterdayDealUTC <= newWindow.end
};
console.log(`   Today's deal (1000 THB):    ${newIncludes.today ? '✅ YES' : '❌ NO'}`);
console.log(`   Yesterday's deal (4000 THB): ${newIncludes.yesterday ? '🐛 YES (WRONG!)' : '✅ NO (CORRECT!)'}`);
if (!newIncludes.yesterday && newIncludes.today) {
  console.log(`   → Total shown: 1000 THB (CORRECT! Only today's deal)`);
}

console.log('\n' + '='.repeat(80));
console.log('RESULT: ' + (newIncludes.today && !newIncludes.yesterday ? '✅ FIX WORKS!' : '❌ FIX FAILED'));
console.log('='.repeat(80));
