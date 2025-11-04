// Test the exact user scenario:
// "en säljare som precis la 1000 thb idag, så stod det 5000 idag? men han hade ju 4000 igår.."

function getTodayWindowOLD() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function getTodayWindowNEW() {
  const now = new Date();
  const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowThailand = new Date(now.getTime() + THAILAND_OFFSET_MS);
  const startThailand = new Date(
    Date.UTC(nowThailand.getUTCFullYear(), nowThailand.getUTCMonth(), nowThailand.getUTCDate(), 0, 0, 0, 0)
  );
  const endThailand = new Date(
    Date.UTC(nowThailand.getUTCFullYear(), nowThailand.getUTCMonth(), nowThailand.getUTCDate(), 23, 59, 59, 999)
  );
  const start = new Date(startThailand.getTime() - THAILAND_OFFSET_MS);
  const end = new Date(endThailand.getTime() - THAILAND_OFFSET_MS);
  return { start, end };
}

console.log('='.repeat(80));
console.log('USER SCENARIO TEST');
console.log('Scenario: Säljare hade 4000 THB igår, la 1000 THB idag');
console.log('Problem: Notifikationen visade 5000 THB idag (fel!)');
console.log('='.repeat(80));

const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;

// Simulate: Current time is 02:00 Thailand time (early morning)
// This is 19:00 UTC PREVIOUS DAY
const nowUTC = new Date('2025-11-04T19:00:00.000Z'); // 19:00 UTC = 02:00 Thailand next day
const nowThailand = new Date(nowUTC.getTime() + THAILAND_OFFSET_MS);

console.log(`\n📅 SIMULATED TIME:`);
console.log(`   Server (UTC):  ${nowUTC.toISOString()} (Nov 4, 19:00)`);
console.log(`   Thailand:      ${nowThailand.toISOString().replace('T', ' ').substring(0, 19)} (Nov 5, 02:00 - early morning)`);

// Yesterday's deal: 4000 THB at 20:00 Thailand time on Nov 4
const yesterdayDealThailand = new Date('2025-11-04T20:00:00.000Z'); // 20:00 Thailand = 13:00 UTC
yesterdayDealThailand.setTime(Date.UTC(2025, 10, 4, 20, 0, 0) + THAILAND_OFFSET_MS);
const yesterdayDealUTC = new Date(yesterdayDealThailand.getTime() - THAILAND_OFFSET_MS * 2);

// Today's deal: 1000 THB at 02:00 Thailand time on Nov 5 (just now)
const todayDealThailand = new Date('2025-11-05T02:00:00.000Z');
todayDealThailand.setTime(Date.UTC(2025, 10, 5, 2, 0, 0) + THAILAND_OFFSET_MS);
const todayDealUTC = new Date(todayDealThailand.getTime() - THAILAND_OFFSET_MS * 2);

console.log(`\n📊 DEALS:`);
console.log(`   Yesterday (4000 THB): 2025-11-04 20:00 Thailand = 2025-11-04T13:00:00.000Z UTC`);
console.log(`   Today (1000 THB):     2025-11-05 02:00 Thailand = 2025-11-04T19:00:00.000Z UTC`);

// Test OLD version
const oldWindow = {
  start: new Date(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 0, 0, 0),
  end: new Date(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 23, 59, 59, 999)
};

console.log(`\n🐛 OLD VERSION "today" window (UTC-based):`);
console.log(`   Start: ${oldWindow.start.toISOString()}`);
const oldStartThailand = new Date(oldWindow.start.getTime() + THAILAND_OFFSET_MS);
console.log(`          → ${oldStartThailand.toISOString().replace('T', ' ').substring(0, 19)} Thailand`);
console.log(`   End:   ${oldWindow.end.toISOString()}`);
const oldEndThailand = new Date(oldWindow.end.getTime() + THAILAND_OFFSET_MS);
console.log(`          → ${oldEndThailand.toISOString().replace('T', ' ').substring(0, 19)} Thailand`);

const oldYesterdayIncluded = new Date('2025-11-04T13:00:00.000Z') >= oldWindow.start &&
                              new Date('2025-11-04T13:00:00.000Z') <= oldWindow.end;
const oldTodayIncluded = new Date('2025-11-04T19:00:00.000Z') >= oldWindow.start &&
                          new Date('2025-11-04T19:00:00.000Z') <= oldWindow.end;

console.log(`\n   Counts yesterday's 4000 THB? ${oldYesterdayIncluded ? '✅ YES (BUG!)' : '❌ NO'}`);
console.log(`   Counts today's 1000 THB?     ${oldTodayIncluded ? '✅ YES' : '❌ NO'}`);

if (oldYesterdayIncluded && oldTodayIncluded) {
  console.log(`   → Total: ${4000 + 1000} THB (BUG! Shows yesterday's + today's deals as "today")`);
} else if (oldTodayIncluded) {
  console.log(`   → Total: 1000 THB`);
}

// Test NEW version
const nowThailandNew = new Date(nowUTC.getTime() + THAILAND_OFFSET_MS);
const startThailand = new Date(
  Date.UTC(nowThailandNew.getUTCFullYear(), nowThailandNew.getUTCMonth(), nowThailandNew.getUTCDate(), 0, 0, 0, 0)
);
const endThailand = new Date(
  Date.UTC(nowThailandNew.getUTCFullYear(), nowThailandNew.getUTCMonth(), nowThailandNew.getUTCDate(), 23, 59, 59, 999)
);
const newWindow = {
  start: new Date(startThailand.getTime() - THAILAND_OFFSET_MS),
  end: new Date(endThailand.getTime() - THAILAND_OFFSET_MS)
};

console.log(`\n✅ NEW VERSION "today" window (Thailand-based):`);
console.log(`   Start: ${newWindow.start.toISOString()}`);
const newStartThailand = new Date(newWindow.start.getTime() + THAILAND_OFFSET_MS);
console.log(`          → ${newStartThailand.toISOString().replace('T', ' ').substring(0, 19)} Thailand`);
console.log(`   End:   ${newWindow.end.toISOString()}`);
const newEndThailand = new Date(newWindow.end.getTime() + THAILAND_OFFSET_MS);
console.log(`          → ${newEndThailand.toISOString().replace('T', ' ').substring(0, 19)} Thailand`);

const newYesterdayIncluded = new Date('2025-11-04T13:00:00.000Z') >= newWindow.start &&
                              new Date('2025-11-04T13:00:00.000Z') <= newWindow.end;
const newTodayIncluded = new Date('2025-11-04T19:00:00.000Z') >= newWindow.start &&
                          new Date('2025-11-04T19:00:00.000Z') <= newWindow.end;

console.log(`\n   Counts yesterday's 4000 THB? ${newYesterdayIncluded ? '❌ YES (BUG!)' : '✅ NO (CORRECT!)'}`);
console.log(`   Counts today's 1000 THB?     ${newTodayIncluded ? '✅ YES (CORRECT!)' : '❌ NO'}`);

if (newYesterdayIncluded && newTodayIncluded) {
  console.log(`   → Total: ${4000 + 1000} THB (BUG!)`);
} else if (newTodayIncluded) {
  console.log(`   → Total: 1000 THB (CORRECT! Only today's deal)`);
}

console.log('\n' + '='.repeat(80));
if (!oldYesterdayIncluded && oldTodayIncluded && !newYesterdayIncluded && newTodayIncluded) {
  console.log('NOTE: In this scenario, both versions work correctly');
  console.log('The bug occurs when the cache is not refreshed at midnight');
} else if (oldYesterdayIncluded && !newYesterdayIncluded) {
  console.log('RESULT: ✅ FIX WORKS! New version correctly excludes yesterday\'s deals');
} else {
  console.log('RESULT: Test scenario needs adjustment');
}
console.log('='.repeat(80));
