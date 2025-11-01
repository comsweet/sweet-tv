const fs = require('fs').promises;
const path = require('path');

class LeaderboardService {
  constructor() {
    // PERSISTENT DISK på Render!
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.leaderboardsFile = path.join(this.dbPath, 'leaderboards.json');
    
    console.log(`💾 Leaderboards path: ${this.dbPath} (isRender: ${isRender})`);
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa leaderboards.json
      try {
        await fs.access(this.leaderboardsFile);
        console.log('✅ leaderboards.json exists');
      } catch {
        await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards: [] }, null, 2));
        console.log('📝 Created leaderboards.json');
      }
    } catch (error) {
      console.error('Error initializing leaderboards database:', error);
    }
  }

  async getLeaderboards() {
    const data = await fs.readFile(this.leaderboardsFile, 'utf8');
    return JSON.parse(data).leaderboards;
  }

  async getLeaderboard(id) {
    const leaderboards = await this.getLeaderboards();
    return leaderboards.find(lb => lb.id === id);
  }

  async getActiveLeaderboards() {
    const leaderboards = await this.getLeaderboards();
    return leaderboards.filter(lb => lb.active);
  }

  async addLeaderboard(leaderboard) {
    const leaderboards = await this.getLeaderboards();

    const newLeaderboard = {
      id: Date.now().toString(),
      name: leaderboard.name,
      userGroups: leaderboard.userGroups || [],
      timePeriod: leaderboard.timePeriod || 'month',
      customStartDate: leaderboard.customStartDate || null,
      customEndDate: leaderboard.customEndDate || null,
      visibleColumns: leaderboard.visibleColumns || {
        sms: true,
        commission: true,
        deals: true
      },
      columnOrder: leaderboard.columnOrder || ['deals', 'sms', 'commission', 'campaignBonus', 'total'],
      sortBy: leaderboard.sortBy || 'commission',
      // NEW: Enhanced display options
      displayMode: leaderboard.displayMode || 'individual', // 'individual' | 'groups'
      topN: leaderboard.topN || null, // null = show all, otherwise limit to top N
      visualizationMode: leaderboard.visualizationMode || 'table', // 'table' | 'cards' | 'progress' | 'rocket' | 'race'
      showGraphs: leaderboard.showGraphs !== undefined ? leaderboard.showGraphs : false,
      showGap: leaderboard.showGap !== undefined ? leaderboard.showGap : true,
      showMiniStats: leaderboard.showMiniStats !== undefined ? leaderboard.showMiniStats : false,
      active: leaderboard.active !== undefined ? leaderboard.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    leaderboards.push(newLeaderboard);
    await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards }, null, 2));
    console.log(`💾 Saved leaderboard "${newLeaderboard.name}" to persistent disk`);
    return newLeaderboard;
  }

  // Alias for consistency with routes
  async createLeaderboard(leaderboard) {
    return await this.addLeaderboard(leaderboard);
  }

  async updateLeaderboard(id, updates) {
    const leaderboards = await this.getLeaderboards();
    const index = leaderboards.findIndex(lb => lb.id === id);

    if (index !== -1) {
      leaderboards[index] = {
        ...leaderboards[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards }, null, 2));
      console.log(`💾 Updated leaderboard "${leaderboards[index].name}" on persistent disk`);
      return leaderboards[index];
    }
    throw new Error(`Leaderboard with id ${id} not found`);
  }

  async deleteLeaderboard(id) {
    const leaderboards = await this.getLeaderboards();
    const filtered = leaderboards.filter(lb => lb.id !== id);

    if (filtered.length === leaderboards.length) {
      throw new Error(`Leaderboard with id ${id} not found`);
    }

    await fs.writeFile(this.leaderboardsFile, JSON.stringify({ leaderboards: filtered }, null, 2));
    console.log(`🗑️  Deleted leaderboard from persistent disk`);
    return true;
  }

  getDateRange(leaderboard) {
    const now = new Date();
    let startDate, endDate;

    switch (leaderboard.timePeriod) {
      case 'day':
        // 🔥 FIX: Use UTC methods to avoid timezone issues
        // This ensures "today" is calculated in UTC, matching SMS timestamps
        startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        console.log(`📅 Day range (UTC): ${startDate.toISOString()} to ${endDate.toISOString()}`);
        break;
      
      case 'week':
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      case 'custom':
        startDate = new Date(leaderboard.customStartDate);
        endDate = new Date(leaderboard.customEndDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  }
}

module.exports = new LeaderboardService();
