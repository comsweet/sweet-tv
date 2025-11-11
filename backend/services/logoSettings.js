const fs = require('fs').promises;
const path = require('path');

/**
 * LOGO SETTINGS SERVICE
 *
 * Manages slideshow logos:
 * - Company logo (left side)
 * - Brand mark (right side)
 */
class LogoSettingsService {
  constructor() {
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.settingsFile = path.join(this.dbPath, 'logoSettings.json');

    console.log(`🖼️ Logo settings path: ${this.dbPath}`);

    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.settingsFile);
        console.log('✅ logoSettings.json exists');
      } catch {
        const defaultSettings = {
          companyLogo: null,  // URL to company logo (left side)
          brandMark: null,     // URL to brand mark (right side)
          lastUpdated: null
        };
        await fs.writeFile(this.settingsFile, JSON.stringify(defaultSettings, null, 2));
        console.log('📝 Created logoSettings.json with defaults');
      }
    } catch (error) {
      console.error('Error initializing logo settings:', error);
    }
  }

  async getSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading logo settings:', error);
      return {
        companyLogo: null,
        brandMark: null,
        lastUpdated: null
      };
    }
  }

  async updateSettings(updates) {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = {
        ...currentSettings,
        ...updates,
        lastUpdated: new Date().toISOString()
      };

      await fs.writeFile(this.settingsFile, JSON.stringify(newSettings, null, 2));
      console.log('💾 Updated logo settings');
      return newSettings;
    } catch (error) {
      console.error('Error updating logo settings:', error);
      throw error;
    }
  }

  async setCompanyLogo(logoUrl) {
    return await this.updateSettings({ companyLogo: logoUrl });
  }

  async setBrandMark(markUrl) {
    return await this.updateSettings({ brandMark: markUrl });
  }

  async clearCompanyLogo() {
    return await this.updateSettings({ companyLogo: null });
  }

  async clearBrandMark() {
    return await this.updateSettings({ brandMark: null });
  }
}

module.exports = new LogoSettingsService();
