const fs = require('fs').promises;
const path = require('path');

/**
 * SOUND SETTINGS SERVICE
 * 
 * Manages global sound settings:
 * - Default sound (standard pling)
 * - Milestone sound (dagsbudget ljud)
 * - Daily budget amount (default 3400 THB)
 */
class SoundSettingsService {
  constructor() {
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.settingsFile = path.join(this.dbPath, 'soundSettings.json');
    
    console.log(`🔊 Sound settings path: ${this.dbPath}`);
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.settingsFile);
        console.log('✅ soundSettings.json exists');
      } catch {
        const defaultSettings = {
          defaultSound: null,  // URL to default pling sound
          milestoneSound: null,  // URL to dagsbudget sound
          dailyBudget: 3400  // THB per day
        };
        await fs.writeFile(this.settingsFile, JSON.stringify(defaultSettings, null, 2));
        console.log('📝 Created soundSettings.json with defaults');
      }
    } catch (error) {
      console.error('Error initializing sound settings:', error);
    }
  }

  async getSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading sound settings:', error);
      return {
        defaultSound: null,
        milestoneSound: null,
        dailyBudget: 3400
      };
    }
  }

  async updateSettings(updates) {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = {
        ...currentSettings,
        ...updates
      };
      
      await fs.writeFile(this.settingsFile, JSON.stringify(newSettings, null, 2));
      console.log('💾 Updated sound settings');
      return newSettings;
    } catch (error) {
      console.error('Error updating sound settings:', error);
      throw error;
    }
  }

  async setDefaultSound(soundUrl) {
    return await this.updateSettings({ defaultSound: soundUrl });
  }

  async setMilestoneSound(soundUrl) {
    return await this.updateSettings({ milestoneSound: soundUrl });
  }

  async setDailyBudget(amount) {
    return await this.updateSettings({ dailyBudget: parseFloat(amount) });
  }
}

module.exports = new SoundSettingsService();
