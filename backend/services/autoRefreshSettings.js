const fs = require('fs').promises;
const path = require('path');

class AutoRefreshSettings {
  constructor() {
    this.settingsFile = path.join(__dirname, '../data/auto-refresh-settings.json');
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
        // File doesn't exist, create with defaults
        await this.updateSettings(this.defaultSettings);
        return this.defaultSettings;
      }
      throw error;
    }
  }

  /**
   * Update auto-refresh settings
   */
  async updateSettings(newSettings) {
    try {
      const currentSettings = await this.getSettings();
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
