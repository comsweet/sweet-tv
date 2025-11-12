// Migration: Add SMS Notification Blocklist table
// Run with: node backend/migrations/add-sms-blocklist.js

const postgres = require('../services/postgres');

async function migrate() {
  console.log('🔄 Starting SMS Blocklist migration...');

  try {
    // Initialize postgres connection
    await postgres.init();
    console.log('✅ Database connection established');

    // Check if table already exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sms_notification_blocklist'
      );
    `;

    const checkResult = await postgres.query(checkQuery);

    if (checkResult.rows[0].exists) {
      console.log('⚠️  SMS Notification Blocklist table already exists. Skipping migration.');
      process.exit(0);
    }

    console.log('📋 Creating sms_notification_blocklist table...');

    // Create table
    await postgres.query(`
      CREATE TABLE IF NOT EXISTS sms_notification_blocklist (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL UNIQUE,
        group_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ SMS Notification Blocklist migration completed successfully!');
    console.log('');
    console.log('📊 Table created:');
    console.log('  - sms_notification_blocklist');
    console.log('');
    console.log('🎉 You can now manage SMS notification blocklist in the Admin UI!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrate();
