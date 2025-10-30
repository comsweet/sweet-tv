const fs = require('fs').promises;
const path = require('path');

class AutoRefreshSettings {
  constructor() {
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.settingsFile = path.join(this.dbPath, 'auto-refresh-settings.json');

    console.log(`⚡ Auto-refresh settings path: ${this.dbPath}`);

    this.defaultSettings = {
      refreshInterval: 5000, // 5 seconds after deal popup
      showIndicator: true,   // Show update indicator during refresh
      enabled: true          // Master toggle for auto-refresh
    };
  }

  /**
   * Get current auto-refresh settings
   */
  async getSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      const settings = JSON.parse(data);
      return { ...this.defaultSettings, ...settings };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return defaults (don't create yet to avoid recursion)
        console.log('⚡ Auto-refresh settings file not found, using defaults');
        return this.defaultSettings;
      }
      console.error('❌ Error reading auto-refresh settings:', error);
      // Return defaults on any error
      return this.defaultSettings;
    }
  }

  /**
   * Update auto-refresh settings
   */
  async updateSettings(newSettings) {
    try {
      // Read current settings directly from file to avoid recursion
      let currentSettings = { ...this.defaultSettings };
      try {
        const data = await fs.readFile(this.settingsFile, 'utf8');
        currentSettings = JSON.parse(data);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('❌ Error reading current settings:', error);
        }
      }

      const updatedSettings = { ...currentSettings, ...newSettings };

      // Validate refreshInterval
      if (updatedSettings.refreshInterval < 0) {
        updatedSettings.refreshInterval = 0;
      }
      if (updatedSettings.refreshInterval > 60000) {
        updatedSettings.refreshInterval = 60000; // Max 60 seconds
      }

      await fs.writeFile(
        this.settingsFile,
        JSON.stringify(updatedSettings, null, 2),
        'utf8'
      );

      console.log('✅ Auto-refresh settings updated:', updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error('❌ Error updating auto-refresh settings:', error);
      throw error;
    }
  }

  /**
   * Reset to default settings
   */
  async resetSettings() {
    await this.updateSettings(this.defaultSettings);
    return this.defaultSettings;
  }
}

module.exports = new AutoRefreshSettings();
