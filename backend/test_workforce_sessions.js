const adversusAPI = require('./services/adversusAPI');

(async () => {
  try {
    console.log('\n=== TESTING WORKFORCE SESSION TIMESTAMPS ===\n');

    // Test for Nov 4-5 (2 days)
    const fromDate = new Date('2025-11-04T00:00:00.000Z');
    const toDate = new Date('2025-11-05T23:59:59.999Z');

    console.log(`📅 Querying: ${fromDate.toISOString()} → ${toDate.toISOString()}\n`);

    const response = await adversusAPI.request('/workforce/buildReport', {
      method: 'POST',
      data: {
        start: fromDate.toISOString(),
        end: toDate.toISOString()
      }
    });

    // Parse response
    let records = [];
    if (typeof response === 'string') {
      const lines = response.trim().split('\n');
      records = lines.map(line => JSON.parse(line)).filter(r => r !== null);
    } else if (Array.isArray(response)) {
      records = response;
    } else {
      records = response.data || [response];
    }

    console.log(`✅ Got ${records.length} total sessions\n`);

    // Find sessions for our test users
    const testUsers = [236442, 248512, 268838];
    const userSessions = records.filter(r => testUsers.includes(r.userid || r.userId));

    console.log(`🔍 Found ${userSessions.length} sessions for our test users\n`);

    // Show first 10 sessions to see structure
    console.log('📋 Sample sessions (showing all fields):\n');
    userSessions.slice(0, 10).forEach((session, i) => {
      console.log(`Session ${i + 1}:`);
      console.log(JSON.stringify(session, null, 2));
      console.log('');
    });

    // Check if we can group by date
    console.log('\n📊 Analyzing timestamps...\n');

    const hasDates = userSessions.every(s => s.start || s.date || s.timestamp);
    console.log(`Has date fields: ${hasDates}`);

    if (hasDates) {
      // Group by day
      const byDay = {};
      userSessions.forEach(session => {
        const dateField = session.start || session.date || session.timestamp;
        const day = new Date(dateField).toISOString().split('T')[0];

        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(session);
      });

      console.log('\n📅 Sessions grouped by day:\n');
      Object.entries(byDay).forEach(([day, sessions]) => {
        const total = sessions.reduce((sum, s) => sum + parseFloat(s.duration || 0), 0);
        console.log(`   ${day}: ${sessions.length} sessions, total ${Math.round(total)}s (${(total/3600).toFixed(2)}h)`);
      });
    }

    console.log('\n=== TEST COMPLETE ===\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
