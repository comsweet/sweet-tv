const fs = require('fs').promises;
const path = require('path');

/**
 * NOTIFICATION SETTINGS
 * 
 * Hanterar vilka user groups som ska trigga pling/notifications.
 * 
 * Settings sparas i: data/notification-settings.json
 * 
 * Group ID kommer från Adversus user.group.id (EJ user.memberOf!)
 */
class NotificationSettings {
  constructor() {
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.settingsFile = path.join(this.dbPath, 'notification-settings.json');
    
    console.log(`🔔 Notification settings path: ${this.dbPath}`);
    
    this.defaultSettings = {
      mode: 'blacklist',
      enabledGroups: [],
      disabledGroups: [],
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

  async getSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading settings:', error);
      return this.defaultSettings;
    }
  }

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

  // 🔥 FIXAD: Huvudfunktion för att kolla om en deal ska trigga notification
  async shouldNotify(agent) {
    const settings = await this.getSettings();
    const groupId = agent.groupId;

    // 🔥 FIX: Om ingen groupId finns, hantera baserat på mode
    if (!groupId || groupId === null) {
      if (settings.mode === 'whitelist') {
        // Whitelist: Om ingen groupId, blockera (inte i listan)
        console.log(`🚫 Agent ${agent.name} has no groupId - BLOCKED in whitelist mode`);
        return false;
      } else {
        // Blacklist: Om ingen groupId, blockera (kan vara admin eller special user)
        console.log(`🚫 Agent ${agent.name} has no groupId - BLOCKED in blacklist mode (safety)`);
        return false;
      }
    }

    if (settings.mode === 'whitelist') {
      // Whitelist mode: Endast tillåtna groups
      const allowed = settings.enabledGroups.includes(groupId);
      if (!allowed) {
        console.log(`🚫 Group ${groupId} (${agent.name}) not in whitelist, blocking notification`);
      } else {
        console.log(`✅ Group ${groupId} (${agent.name}) is whitelisted, allowing notification`);
      }
      return allowed;
    } else {
      // Blacklist mode (default): Alla utom blockerade
      const blocked = settings.disabledGroups.includes(groupId);
      if (blocked) {
        console.log(`🚫 Group ${groupId} (${agent.name}) is blacklisted, blocking notification`);
      } else {
        console.log(`✅ Group ${groupId} (${agent.name}) not blacklisted, allowing notification`);
      }
      return !blocked;
    }
  }

  async blockGroup(groupId) {
    const settings = await this.getSettings();
    
    if (!settings.disabledGroups.includes(groupId)) {
      settings.disabledGroups.push(groupId);
      await this.updateSettings(settings);
      console.log(`🚫 Blocked group: ${groupId}`);
    }
    
    return settings;
  }

  async unblockGroup(groupId) {
    const settings = await this.getSettings();
    settings.disabledGroups = settings.disabledGroups.filter(
      id => id !== groupId
    );
    await this.updateSettings(settings);
    console.log(`✅ Unblocked group: ${groupId}`);
    return settings;
  }

  async enableGroup(groupId) {
    const settings = await this.getSettings();
    
    if (!settings.enabledGroups.includes(groupId)) {
      settings.enabledGroups.push(groupId);
      await this.updateSettings(settings);
      console.log(`✅ Enabled group: ${groupId}`);
    }
    
    return settings;
  }

  async disableGroup(groupId) {
    const settings = await this.getSettings();
    settings.enabledGroups = settings.enabledGroups.filter(
      id => id !== groupId
    );
    await this.updateSettings(settings);
    console.log(`🚫 Disabled group: ${groupId}`);
    return settings;
  }

  async setMode(mode) {
    if (!['whitelist', 'blacklist'].includes(mode)) {
      throw new Error('Mode must be "whitelist" or "blacklist"');
    }
    
    return await this.updateSettings({ mode });
  }

  async getAvailableGroups(adversusAPI) {
    try {
      console.log('🔍 Fetching available groups from Adversus...');
      
      const usersResult = await adversusAPI.getUsers();
      const users = usersResult.users || [];
      
      console.log(`   📋 Got ${users.length} users from Adversus`);
      
      const groupsMap = new Map();
      
      users.forEach(user => {
        if (user.group && user.group.id) {
          const groupId = parseInt(user.group.id);
          const groupName = user.group.name || `Group ${groupId}`;
          
          if (!groupsMap.has(groupId)) {
            groupsMap.set(groupId, {
              id: groupId,
              name: groupName,
              agentCount: 0
            });
          }
          
          groupsMap.get(groupId).agentCount++;
        }
      });
      
      const groups = Array.from(groupsMap.values()).sort((a, b) => b.agentCount - a.agentCount);
      
      console.log(`   ✅ Found ${groups.length} unique groups`);
      
      return groups;
    } catch (error) {
      console.error('Error fetching available groups:', error);
      return [];
    }
  }
}

module.exports = new NotificationSettings();
