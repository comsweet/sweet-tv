const adversusAPI = require('./services/adversusAPI');

(async () => {
  try {
    console.log('\n=== LIVE ADVERSUS API TEST - 4 NOVEMBER ===\n');

    const userIds = [236442, 248512, 268838]; // Hampus, Marcus, Jakob

    // Test date: 4 November 2025
    const fromDate = new Date('2025-11-04T00:00:00.000Z');
    const toDate = new Date('2025-11-04T23:59:59.999Z');

    console.log(`📅 Querying Adversus for: ${fromDate.toISOString()} → ${toDate.toISOString()}\n`);

    // METHOD 1: Individual /loginTime endpoint (old method)
    console.log('🔍 METHOD 1: Individual /loginTime endpoint\n');

    for (const userId of userIds) {
      try {
        const filters = {
          "timestamp": {
            "$gt": fromDate.toISOString(),
            "$lt": toDate.toISOString()
          }
        };

        console.log(`   Querying user ${userId}...`);
        const response = await adversusAPI.request(`/users/${userId}/loginTime`, {
          method: 'GET',
          params: {
            filters: JSON.stringify(filters)
          }
        });

        const loginSeconds = parseInt(response.loginSeconds || 0);
        const hours = (loginSeconds / 3600).toFixed(2);

        console.log(`   ✅ User ${userId}: ${loginSeconds}s (${hours}h)`);
        console.log(`      Response fromDate: ${response.fromDate}`);
        console.log(`      Response toDate: ${response.toDate}\n`);
      } catch (error) {
        console.error(`   ❌ Failed to fetch for user ${userId}:`, error.message, '\n');
      }
    }

    // METHOD 2: Workforce /buildReport endpoint (new method - what we use in production)
    console.log('\n🔍 METHOD 2: Workforce /buildReport endpoint (production method)\n');

    try {
      console.log(`   Calling /workforce/buildReport for all users...`);

      const response = await adversusAPI.request('/workforce/buildReport', {
        method: 'POST',
        data: {
          start: fromDate.toISOString(),
          end: toDate.toISOString()
          // No userId = get ALL users
        }
      });

      // Parse response - can be NDJSON string or JSON array
      let records = [];

      if (typeof response === 'string') {
        // NDJSON format (newline-delimited JSON)
        const lines = response.trim().split('\n');
        records = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch (err) {
            console.warn('⚠️  Failed to parse NDJSON line:', line.substring(0, 100));
            return null;
          }
        }).filter(r => r !== null);
      } else if (Array.isArray(response)) {
        records = response;
      } else if (response && typeof response === 'object') {
        records = response.data || [response];
      }

      console.log(`   ✅ Got ${records.length} workforce records\n`);

      // Filter to our 3 users and sum their durations
      const userLoginMap = new Map();

      records.forEach(record => {
        const userId = record.userid || record.userId;
        const duration = parseFloat(record.duration || 0);

        if (userIds.includes(userId)) {
          const current = userLoginMap.get(userId) || 0;
          userLoginMap.set(userId, current + duration);

          // DEBUG: Log each session
          console.log(`   📋 Session for user ${userId}:`);
          console.log(`      Duration: ${duration}s (${(duration/3600).toFixed(2)}h)`);
          if (record.start) console.log(`      Start: ${record.start}`);
          if (record.end) console.log(`      End: ${record.end}`);
        }
      });

      console.log('\n   📊 WORKFORCE API TOTALS:\n');
      for (const userId of userIds) {
        const totalSeconds = Math.round(userLoginMap.get(userId) || 0);
        const hours = (totalSeconds / 3600).toFixed(2);
        console.log(`   User ${userId}: ${totalSeconds}s (${hours}h)`);
      }

      const grandTotal = Array.from(userLoginMap.values()).reduce((sum, val) => sum + val, 0);
      console.log(`\n   🎯 GRAND TOTAL: ${Math.round(grandTotal)}s (${(grandTotal/3600).toFixed(2)}h)`);

    } catch (error) {
      console.error('   ❌ Failed to fetch workforce data:', error.message);
    }

    console.log('\n=== ANALYSIS COMPLETE ===\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
