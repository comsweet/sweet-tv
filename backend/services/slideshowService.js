const fs = require('fs').promises;
const path = require('path');

class SlideshowService {
  constructor() {
    this.dbPath = path.join(__dirname, '../data');
    this.slideshowsFile = path.join(this.dbPath, 'slideshows.json');
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa slideshows.json
      try {
        await fs.access(this.slideshowsFile);
      } catch {
        await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows: [] }, null, 2));
      }
    } catch (error) {
      console.error('Error initializing slideshows database:', error);
    }
  }

  async getSlideshows() {
    const data = await fs.readFile(this.slideshowsFile, 'utf8');
    return JSON.parse(data).slideshows;
  }

  async getSlideshow(id) {
    const slideshows = await this.getSlideshows();
    return slideshows.find(s => s.id === id);
  }

  async getActiveSlideshows() {
    const slideshows = await this.getSlideshows();
    return slideshows.filter(s => s.active);
  }

  async addSlideshow(slideshow) {
    const slideshows = await this.getSlideshows();
    
    const newSlideshow = {
      id: Date.now().toString(),
      name: slideshow.name,
      leaderboards: slideshow.leaderboards || [],
      duration: slideshow.duration || 15,
      active: slideshow.active !== undefined ? slideshow.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    slideshows.push(newSlideshow);
    await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows }, null, 2));
    return newSlideshow;
  }

  async updateSlideshow(id, updates) {
    const slideshows = await this.getSlideshows();
    const index = slideshows.findIndex(s => s.id === id);
    
    if (index !== -1) {
      slideshows[index] = { 
        ...slideshows[index], 
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows }, null, 2));
      return slideshows[index];
    }
    return null;
  }

  async deleteSlideshow(id) {
    const slideshows = await this.getSlideshows();
    const filtered = slideshows.filter(s => s.id !== id);
    await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows: filtered }, null, 2));
    return true;
  }
}

module.exports = new SlideshowService();
