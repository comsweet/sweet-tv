// backend/services/slideshows.js
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
    
    // 🔥 FIXAT: Parenteser runt template literal
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
      type: slideshow.type || 'single', // ✨ Support för type
      leaderboards: slideshow.leaderboards || [],
      dualSlides: slideshow.dualSlides || [], // ✨ Support för dualSlides
      duration: slideshow.duration || 15,
      active: slideshow.active !== undefined ? slideshow.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    slideshows.push(newSlideshow);
    await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows }, null, 2));
    // 🔥 FIXAT: Parenteser runt template literal
    console.log(`💾 Saved ${newSlideshow.type} slideshow "${newSlideshow.name}" to persistent disk`);
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
      // 🔥 FIXAT: Parenteser runt template literal
      console.log(`💾 Updated slideshow "${slideshows[index].name}" on persistent disk`);
      return slideshows[index];
    }
    return null;
  }

  async deleteSlideshow(id) {
    const slideshows = await this.getSlideshows();
    const filtered = slideshows.filter(s => s.id !== id);
    await fs.writeFile(this.slideshowsFile, JSON.stringify({ slideshows: filtered }, null, 2));
    // 🔥 FIXAT: Parenteser runt template literal (denna var faktiskt redan rätt, men för säkerhets skull)
    console.log(`🗑️  Deleted slideshow from persistent disk`);
    return true;
  }
}

module.exports = new SlideshowService();
