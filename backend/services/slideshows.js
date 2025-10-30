const fs = require('fs').promises;
const path = require('path');

class SlideshowService {
  constructor() {
    // PERSISTENT DISK på Render!
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.slideshowsFile = path.join(this.dbPath, 'slideshows.json');
    
    console.log(`💾 Slideshows path: ${this.dbPath} (isRender: ${isRender})`);
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa slideshows.json
      try {
        await fs.access(this.slideshowsFile);
        console.log('✅ slideshows.json exists');
      } catch {
        await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows: [] }, null, 2));
        console.log('📝 Created slideshows.json');
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
      slides: slideshow.slides || [], // Support both formats
      duration: slideshow.duration || 15,
      active: slideshow.active !== undefined ? slideshow.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    slideshows.push(newSlideshow);
    await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows }, null, 2));
    console.log(`💾 Saved slideshow "${newSlideshow.name}" to persistent disk`);
    return newSlideshow;
  }

  // Alias for consistency with routes
  async createSlideshow(slideshow) {
    return await this.addSlideshow(slideshow);
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
      console.log(`💾 Updated slideshow "${slideshows[index].name}" on persistent disk`);
      return slideshows[index];
    }
    throw new Error(`Slideshow with id ${id} not found`);
  }

  async deleteSlideshow(id) {
    const slideshows = await this.getSlideshows();
    const filtered = slideshows.filter(s => s.id !== id);

    if (filtered.length === slideshows.length) {
      throw new Error(`Slideshow with id ${id} not found`);
    }

    await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows: filtered }, null, 2));
    console.log(`🗑️  Deleted slideshow from persistent disk`);
    return true;
  }
}

module.exports = new SlideshowService();
