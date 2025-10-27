const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
  constructor() {
    // PERSISTENT DISK på Render!
    // Check if we're on Render and use persistent disk
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'  // Render persistent disk
      : path.join(__dirname, '../data'); // Local development
    
    this.agentsFile = path.join(this.dbPath, 'agents.json');
    
    console.log(`💾 Database path: ${this.dbPath} (isRender: ${isRender})`);
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa agents.json
      try {
        await fs.access(this.agentsFile);
        console.log('✅ agents.json exists');
      } catch {
        await fs.writeFile(this.agentsFile, JSON.stringify({ agents: [] }, null, 2));
        console.log('📝 Created agents.json');
      }
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  }

  // ==================== AGENTS ====================

  async getAgents() {
    const data = await fs.readFile(this.agentsFile, 'utf8');
    return JSON.parse(data).agents;
  }

  async getAgent(userId) {
    const agents = await this.getAgents();
    // Normalize userId to number for comparison
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    return agents.find(agent => agent.userId === userIdNum);
  }

  async addAgent(agent) {
    const agents = await this.getAgents();
    
    // Konvertera userId till number för consistency med Adversus API
    const userId = typeof agent.userId === 'string' ? parseInt(agent.userId, 10) : agent.userId;
    
    const existingIndex = agents.findIndex(a => a.userId === userId);
    
    // Default sound preferences
    const agentData = {
      ...agent,
      userId: userId,  // Använd normalized userId (NUMBER)
      customSound: agent.customSound || null,
      preferCustomSound: agent.preferCustomSound !== undefined ? 
        agent.preferCustomSound : 
        false,
      profileImage: agent.profileImage || null,
      createdAt: agent.createdAt || new Date().toISOString()
    };
    
    if (existingIndex !== -1) {
      // Agent finns redan, uppdatera
      agents[existingIndex] = { ...agents[existingIndex], ...agentData };
      await fs.writeFile(this.agentsFile, JSON.stringify({ agents }, null, 2));
      console.log(`💾 Updated existing agent ${userId} on persistent disk`);
      return agents[existingIndex];
    } else {
      // Ny agent
      agents.push(agentData);
      await fs.writeFile(this.agentsFile, JSON.stringify({ agents }, null, 2));
      console.log(`💾 Added new agent ${userId} to persistent disk`);
      return agentData;
    }
  }

  async updateAgent(userId, updates) {
    const agents = await this.getAgents();
    // Normalize userId to number
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    const index = agents.findIndex(a => a.userId === userIdNum);
    
    if (index !== -1) {
      agents[index] = { ...agents[index], ...updates };
      await fs.writeFile(this.agentsFile, JSON.stringify({ agents }, null, 2));
      console.log(`💾 Updated agent ${userIdNum} on persistent disk`);
      return agents[index];
    }
    return null;
  }

  async deleteAgent(userId) {
    const agents = await this.getAgents();
    // Normalize userId to number
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const filtered = agents.filter(a => a.userId !== userIdNum);
    await fs.writeFile(this.agentsFile, JSON.stringify({ agents: filtered }, null, 2));
    console.log(`🗑️  Deleted agent ${userIdNum} from persistent disk`);
    return true;
  }
}

module.exports = new DatabaseService();
