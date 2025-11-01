// backend/scripts/migrate-to-postgres.js
// Script to migrate agents from JSON file to Postgres

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const postgres = require('../services/postgres');
const bcrypt = require('bcrypt');

async function migrateAgents() {
  console.log('🔄 Starting migration...\n');

  try {
    // Initialize Postgres
    await postgres.init();

    // Try to read agents from file
    const isRender = process.env.RENDER === 'true';
    const dbPath = isRender ? '/var/data' : path.join(__dirname, '../data');
    const agentsFile = path.join(dbPath, 'agents.json');

    let fileAgents = [];
    try {
      const data = await fs.readFile(agentsFile, 'utf8');
      fileAgents = JSON.parse(data).agents || [];
      console.log(`📄 Found ${fileAgents.length} agents in file system`);
    } catch (error) {
      console.log('📄 No agents file found (this is OK for new installations)');
    }

    // Migrate agents to Postgres
    let migratedCount = 0;
    for (const agent of fileAgents) {
      try {
        await postgres.createAgent({
          userId: agent.userId,
          name: agent.name,
          email: agent.email || null,
          profileImage: agent.profileImage || null,
          groupId: agent.groupId || null,
          groupName: agent.groupName || null
        });
        migratedCount++;
        console.log(`✅ Migrated agent: ${agent.name} (${agent.userId})`);
      } catch (error) {
        console.log(`⚠️  Agent ${agent.userId} already exists or error: ${error.message}`);
      }
    }

    console.log(`\n✅ Migration complete: ${migratedCount}/${fileAgents.length} agents migrated`);

    // Create superadmin user
    console.log('\n👤 Creating superadmin user...');
    const superadminEmail = 'samir@sweet-communication.com';
    const superadminPassword = 'sweet2024'; // CHANGE THIS IMMEDIATELY AFTER FIRST LOGIN

    try {
      const existingUser = await postgres.getUserByEmail(superadminEmail);
      if (existingUser) {
        console.log(`✅ Superadmin already exists: ${superadminEmail}`);
      } else {
        const passwordHash = await bcrypt.hash(superadminPassword, 10);
        await postgres.createUser({
          email: superadminEmail,
          passwordHash: passwordHash,
          name: 'Samir (Superadmin)',
          role: 'superadmin'
        });
        console.log(`✅ Superadmin created: ${superadminEmail}`);
        console.log(`🔑 Temporary password: ${superadminPassword}`);
        console.log('⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!');
      }
    } catch (error) {
      console.error('❌ Error creating superadmin:', error.message);
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Login with: samir@sweet-communication.com / sweet2024');
    console.log('2. Change your password immediately');
    console.log('3. Configure persistent disk in Render.com at /var/data');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateAgents();
