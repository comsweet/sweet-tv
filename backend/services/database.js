const fs = require('fs').promises;
const path = require('path');
const postgres = require('./postgres');

class DatabaseService {
  constructor() {
    // PERSISTENT DISK på Render för filer (bilder, ljud)
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'  // Render persistent disk
      : path.join(__dirname, '../data'); // Local development

    console.log(`💾 File storage path: ${this.dbPath} (isRender: ${isRender})`);
    console.log(`🐘 Using PostgreSQL for agents, users, and audit logs`);

    this.initDatabase();
  }

  async initDatabase() {
    try {
      // Create directory for files (profile images, sounds)
      await fs.mkdir(this.dbPath, { recursive: true });
      console.log('✅ File storage directory ready');

      // Initialize Postgres connection
      await postgres.init();
    } catch (error) {
      console.error('❌ Error initializing database:', error);
    }
  }

  // ==================== AGENTS (Now using Postgres) ====================

  async getAgents() {
    const agents = await postgres.getAgents();
    // Convert snake_case to camelCase for backward compatibility
    return agents.map(agent => ({
      userId: agent.user_id,
      name: agent.name,
      email: agent.email,
      profileImage: agent.profile_image,
      groupId: agent.group_id,
      groupName: agent.group_name,
      customSound: agent.custom_sound,
      preferCustomSound: agent.prefer_custom_sound,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at
    }));
  }

  async getAgent(userId) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const agent = await postgres.getAgent(userIdNum);

    if (!agent) return null;

    // Convert to camelCase
    return {
      userId: agent.user_id,
      name: agent.name,
      email: agent.email,
      profileImage: agent.profile_image,
      groupId: agent.group_id,
      groupName: agent.group_name,
      customSound: agent.custom_sound,
      preferCustomSound: agent.prefer_custom_sound,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at
    };
  }

  async addAgent(agent) {
    const userId = typeof agent.userId === 'string' ? parseInt(agent.userId, 10) : agent.userId;

    const agentData = {
      userId: userId,
      name: agent.name,
      email: agent.email || null,
      profileImage: agent.profileImage || null,
      groupId: agent.groupId || null,
      groupName: agent.groupName || null
    };

    const result = await postgres.createAgent(agentData);

    console.log(`💾 Added/Updated agent ${userId} in PostgreSQL`);

    // Return in camelCase format
    return {
      userId: result.user_id,
      name: result.name,
      email: result.email,
      profileImage: result.profile_image,
      groupId: result.group_id,
      groupName: result.group_name,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  async updateAgent(userId, updates) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;

    const result = await postgres.updateAgent(userIdNum, updates);

    if (!result) return null;

    console.log(`💾 Updated agent ${userIdNum} in PostgreSQL`);

    return {
      userId: result.user_id,
      name: result.name,
      email: result.email,
      profileImage: result.profile_image,
      groupId: result.group_id,
      groupName: result.group_name,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  async deleteAgent(userId) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    await postgres.deleteAgent(userIdNum);
    console.log(`🗑️  Deleted agent ${userIdNum} from PostgreSQL`);
    return true;
  }
}

module.exports = new DatabaseService();
