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
    this.dealsFile = path.join(this.dbPath, 'deals.json');
    
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

      // Skapa deals.json
      try {
        await fs.access(this.dealsFile);
        console.log('✅ deals.json exists');
      } catch {
        await fs.writeFile(this.dealsFile, JSON.stringify({ deals: [] }, null, 2));
        console.log('📝 Created deals.json');
      }
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  }

  // AGENTS
  async getAgents() {
    const data = await fs.readFile(this.agentsFile, 'utf8');
    return JSON.parse(data).agents;
  }

  async getAgent(userId) {
    const agents = await this.getAgents();
    return agents.find(agent => agent.userId === userId);
  }

  async addAgent(agent) {
    const agents = await this.getAgents();
    const existingIndex = agents.findIndex(a => a.userId === agent.userId);
    
    // Default sound preferences
    const agentData = {
      ...agent,
      customSound: agent.customSound || null,
      preferCustomSound: agent.preferCustomSound !== undefined ? agent.preferCustomSound : false
    };
    
    if (existingIndex !== -1) {
      agents[existingIndex] = { ...agents[existingIndex], ...agentData };
    } else {
      agents.push(agentData);
    }
    
    await fs.writeFile(this.agentsFile, JSON.stringify({ agents }, null, 2));
    console.log(`💾 Saved agent ${agent.userId} to persistent disk`);
    return agentData;
  }

  async updateAgent(userId, updates) {
    const agents = await this.getAgents();
    const index = agents.findIndex(a => a.userId === userId);
    
    if (index !== -1) {
      agents[index] = { ...agents[index], ...updates };
      await fs.writeFile(this.agentsFile, JSON.stringify({ agents }, null, 2));
      console.log(`💾 Updated agent ${userId} on persistent disk`);
      return agents[index];
    }
    return null;
  }

  async deleteAgent(userId) {
    const agents = await this.getAgents();
    const filtered = agents.filter(a => a.userId !== userId);
    await fs.writeFile(this.agentsFile, JSON.stringify({ agents: filtered }, null, 2));
    console.log(`🗑️  Deleted agent ${userId} from persistent disk`);
    return true;
  }

  // DEALS
  async getDeals() {
    const data = await fs.readFile(this.dealsFile, 'utf8');
    return JSON.parse(data).deals;
  }

  async addDeal(deal) {
    const deals = await this.getDeals();
    
    // Undvik dubbletter
    const exists = deals.find(d => d.leadId === deal.leadId);
    if (exists) {
      console.log('Deal already exists, skipping:', deal.leadId);
      return null;
    }

    const newDeal = {
      id: Date.now().toString(),
      ...deal,
      timestamp: new Date().toISOString()
    };
    deals.push(newDeal);
    await fs.writeFile(this.dealsFile, JSON.stringify({ deals }, null, 2));
    console.log(`💾 Saved deal ${newDeal.id} to persistent disk`);
    return newDeal;
  }

  async getDealsInRange(startDate, endDate) {
    const deals = await this.getDeals();
    return deals.filter(deal => {
      const dealDate = new Date(deal.orderDate || deal.timestamp);
      return dealDate >= startDate && dealDate <= endDate;
    });
  }

  // Get today's deals for a specific agent
  async getTodayDealsForAgent(userId) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    const deals = await this.getDealsInRange(startOfDay, endOfDay);
    return deals.filter(deal => String(deal.userId) === String(userId));
  }

  // Get today's total commission for agent
  async getTodayTotalForAgent(userId) {
    const todayDeals = await this.getTodayDealsForAgent(userId);
    return todayDeals.reduce((sum, deal) => sum + parseFloat(deal.commission || 0), 0);
  }
}

module.exports = new DatabaseService();
