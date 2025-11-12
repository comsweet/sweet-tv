const fs = require('fs').promises;
const path = require('path');

/**
 * Company Logos Service
 * Manages global company logos that can be reused across leaderboards
 */
class CompanyLogosService {
  constructor() {
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.logosFile = path.join(this.dbPath, 'company-logos.json');

    console.log(`💾 Company logos path: ${this.dbPath}`);

    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.logosFile);
        console.log('✅ company-logos.json exists');
      } catch {
        await fs.writeFile(this.logosFile, JSON.stringify({ logos: [] }, null, 2));
        console.log('📝 Created company-logos.json');
      }
    } catch (error) {
      console.error('Error initializing company logos database:', error);
    }
  }

  async getLogos() {
    const data = await fs.readFile(this.logosFile, 'utf8');
    return JSON.parse(data).logos;
  }

  async getLogo(id) {
    const logos = await this.getLogos();
    return logos.find(logo => logo.id === id);
  }

  async addLogo(logoData) {
    const logos = await this.getLogos();

    const newLogo = {
      id: Date.now().toString(),
      name: logoData.name,
      url: logoData.url, // Cloudinary URL
      uploadedAt: new Date().toISOString(),
      usedBy: [] // Array of leaderboard IDs using this logo
    };

    logos.push(newLogo);
    await fs.writeFile(this.logosFile, JSON.stringify({ logos }, null, 2));
    console.log(`💾 Saved company logo "${newLogo.name}"`);
    return newLogo;
  }

  async updateLogo(id, updates) {
    const logos = await this.getLogos();
    const index = logos.findIndex(logo => logo.id === id);

    if (index !== -1) {
      logos[index] = {
        ...logos[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await fs.writeFile(this.logosFile, JSON.stringify({ logos }, null, 2));
      console.log(`💾 Updated company logo "${logos[index].name}"`);
      return logos[index];
    }
    throw new Error(`Logo with id ${id} not found`);
  }

  async deleteLogo(id) {
    const logos = await this.getLogos();
    const logo = logos.find(l => l.id === id);

    if (!logo) {
      throw new Error(`Logo with id ${id} not found`);
    }

    // Check if logo is in use
    if (logo.usedBy && logo.usedBy.length > 0) {
      throw new Error(`Cannot delete logo "${logo.name}" - it is used by ${logo.usedBy.length} leaderboard(s)`);
    }

    const filtered = logos.filter(l => l.id !== id);
    await fs.writeFile(this.logosFile, JSON.stringify({ logos: filtered }, null, 2));
    console.log(`🗑️  Deleted company logo "${logo.name}"`);
    return true;
  }

  /**
   * Add a leaderboard to the usedBy array
   */
  async addUsage(logoId, leaderboardId) {
    const logos = await this.getLogos();
    const logo = logos.find(l => l.id === logoId);

    if (!logo) {
      throw new Error(`Logo with id ${logoId} not found`);
    }

    if (!logo.usedBy) {
      logo.usedBy = [];
    }

    if (!logo.usedBy.includes(leaderboardId)) {
      logo.usedBy.push(leaderboardId);
      await fs.writeFile(this.logosFile, JSON.stringify({ logos }, null, 2));
      console.log(`📌 Logo "${logo.name}" now used by leaderboard ${leaderboardId}`);
    }
  }

  /**
   * Remove a leaderboard from the usedBy array
   */
  async removeUsage(logoId, leaderboardId) {
    const logos = await this.getLogos();
    const logo = logos.find(l => l.id === logoId);

    if (!logo) {
      return; // Logo might have been deleted
    }

    if (logo.usedBy) {
      logo.usedBy = logo.usedBy.filter(id => id !== leaderboardId);
      await fs.writeFile(this.logosFile, JSON.stringify({ logos }, null, 2));
      console.log(`📌 Logo "${logo.name}" no longer used by leaderboard ${leaderboardId}`);
    }
  }
}

module.exports = new CompanyLogosService();
