const fs = require('fs').promises;
const path = require('path');

/**
 * NOTIFICATION SETTINGS
 * 
 * Hanterar vilka user groups som ska trigga pling/notifications.
 * 
 * Settings sparas i: data/notification-settings.json
 * 
 * Exempel settings:
 * {
 *   "enabledGroups": [1318, 14918],  // Endast dessa groups
 *   "disabledGroups": [9999],        // Blocka dessa groups
 *   "mode": "whitelist"              // "whitelist" eller "blacklist"
 * }
 * 
 * Group ID kommer från Adversus user.group.id (EJ user.memberOf!)
 */
class NotificationSettings {
  constructor() {
    // 🔥 FIX: Använd samma logik som soundSettings.js för Render persistent disk
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.settingsFile = path.join(this.dbPath, 'notification-settings.json');
    
    console.log(`🔔 Notification settings path: ${this.dbPath}`);
    
    this.defaultSettings = {
      mode: 'blacklist', // "whitelist" eller "blacklist"
      enabledGroups: [], // Lista av group IDs (används i whitelist mode)
      disabledGroups: [], // Lista av group IDs (används i blacklist mode)
      lastUpdated: null
    };
    this.initSettings();
  }

  async initSettings() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.settingsFile);
        console.log('✅ Notification settings file exists');
      } catch {
        // Skapa default settings
        await fs.writeFile(
          this.settingsFile, 
          JSON.stringify(this.defaultSettings, null, 2)
        );
        console.log('📝 Created default notification settings');
      }
    } catch (error) {
      console.error('Error initializing notification settings:', error);
    }
  }

  // Läs settings
  async getSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading settings:', error);
      return this.defaultSettings;
    }
  }

  // Uppdatera settings
  async updateSettings(newSettings) {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = {
        ...currentSettings,
        ...newSettings,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(
        this.settingsFile, 
        JSON.stringify(updatedSettings, null, 2)
      );
      
      console.log('✅ Updated notification settings:', updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  // 🔥 Huvudfunktion: Kolla om en deal ska trigga notification
  // Input: agent object med groupId (från Adversus user.group.id)
  async shouldNotify(agent) {
    const settings = await this.getSettings();
    const groupId = agent.groupId;

    // Om ingen group ID finns, låt alltid igenom (för säkerhets skull)
    if (!groupId) {
      console.log('⚠️  Agent has no groupId, allowing notification');
      return true;
    }

    if (settings.mode === 'whitelist') {
      // Whitelist mode: Endast tillåtna groups
      const allowed = settings.enabledGroups.includes(groupId);
      if (!allowed) {
        console.log(`🚫 Group ${groupId} (${agent.name}) not in whitelist, blocking notification`);
      }
      return allowed;
    } else {
      // Blacklist mode (default): Alla utom blockerade
      const blocked = settings.disabledGroups.includes(groupId);
      if (blocked) {
        console.log(`🚫 Group ${groupId} (${agent.name}) is blacklisted, blocking notification`);
      }
      return !blocked;
    }
  }

  // Lägg till group i blacklist
  async blockGroup(groupId) {
    const settings = await this.getSettings();
    
    if (!settings.disabledGroups.includes(groupId)) {
      settings.disabledGroups.push(groupId);
      await this.updateSettings(settings);
      console.log(`🚫 Blocked group: ${groupId}`);
    }
    
    return settings;
  }

  // Ta bort group från blacklist
  async unblockGroup(groupId) {
    const settings = await this.getSettings();
    settings.disabledGroups = settings.disabledGroups.filter(
      id => id !== groupId
    );
    await this.updateSettings(settings);
    console.log(`✅ Unblocked group: ${groupId}`);
    return settings;
  }

  // Lägg till group i whitelist
  async enableGroup(groupId) {
    const settings = await this.getSettings();
    
    if (!settings.enabledGroups.includes(groupId)) {
      settings.enabledGroups.push(groupId);
      await this.updateSettings(settings);
      console.log(`✅ Enabled group: ${groupId}`);
    }
    
    return settings;
  }

  // Ta bort group från whitelist
  async disableGroup(groupId) {
    const settings = await this.getSettings();
    settings.enabledGroups = settings.enabledGroups.filter(
      id => id !== groupId
    );
    await this.updateSettings(settings);
    console.log(`🚫 Disabled group: ${groupId}`);
    return settings;
  }

  // Byt mode (whitelist <-> blacklist)
  async setMode(mode) {
    if (!['whitelist', 'blacklist'].includes(mode)) {
      throw new Error('Mode must be "whitelist" or "blacklist"');
    }
    
    return await this.updateSettings({ mode });
  }

  // Hämta alla unika groups från agents (för UI)
  async getAvailableGroups(database) {
    const agents = await database.getAllAgents();
    const groups = new Map();
    
    agents.forEach(agent => {
      if (agent.groupId && !groups.has(agent.groupId)) {
        groups.set(agent.groupId, {
          id: agent.groupId,
          name: agent.groupName || `Group ${agent.groupId}`,
          agentCount: 0
        });
      }
      if (agent.groupId) {
        groups.get(agent.groupId).agentCount++;
      }
    });
    
    return Array.from(groups.values()).sort((a, b) => b.agentCount - a.agentCount);
  }
}

module.exports = new NotificationSettings();
