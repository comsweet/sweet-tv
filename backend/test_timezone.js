// Test timezone logic
const now = new Date();
console.log('Server time (local):', now.toString());
console.log('UTC time:', now.toISOString());
console.log('');
console.log('Using getUTC* methods (what code does):');
console.log('  now.getUTCFullYear():', now.getUTCFullYear());
console.log('  now.getUTCMonth():', now.getUTCMonth());
console.log('  now.getUTCDate():', now.getUTCDate());

const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
console.log('');
console.log('todayStart (UTC):', todayStart.toISOString());
console.log('');

// Simulate what happens in Bangkok timezone
console.log('If server is in Bangkok (UTC+7) at 02:00 on Nov 15:');
console.log('  Local time: Nov 15, 02:00');
console.log('  UTC time: Nov 14, 19:00');
console.log('  now.getUTCDate() returns: 14 (not 15!)');
console.log('  todayStart becomes: 2025-11-14T00:00:00.000Z');
console.log('  Central sync syncs: Nov 14 (not Nov 15!)');
