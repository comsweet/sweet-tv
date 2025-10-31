const fs = require('fs').promises;
const path = require('path');

/**
 * CAMPAIGN CACHE SERVICE
 *
 * Hanterar caching av campaign names från Adversus API
 * Parsar campaign groups från campaign names
 *
 * Exempel:
 * - "Dentle Kallkund - Sverige 10015KK1-3m_K" → "Dentle Kallkund"
 * - "Sinfrid Varmkund - nykund w44 2025" → "Sinfrid Varmkund"
 */
class CampaignCache {
  constructor() {
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.cacheFile = path.join(this.dbPath, 'campaign-cache.json');

    console.log(`📋 Campaign cache path: ${this.dbPath}`);

    // In-memory cache for fast access
    this.campaigns = new Map();

    this.initCache();
  }

  async initCache() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        const data = await fs.readFile(this.cacheFile, 'utf8');
        const parsed = JSON.parse(data);

        // Load into memory
        if (parsed.campaigns) {
          Object.entries(parsed.campaigns).forEach(([campaignId, info]) => {
            this.campaigns.set(campaignId, info);
          });
        }

        console.log(`✅ Loaded ${this.campaigns.size} campaigns from cache`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          await fs.writeFile(this.cacheFile, JSON.stringify({ campaigns: {} }, null, 2));
          console.log('📝 Created campaign-cache.json');
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error initializing campaign cache:', error);
    }
  }

  async saveCache() {
    try {
      const campaignsObj = {};
      this.campaigns.forEach((info, campaignId) => {
        campaignsObj[campaignId] = info;
      });

      await fs.writeFile(
        this.cacheFile,
        JSON.stringify({ campaigns: campaignsObj }, null, 2)
      );
    } catch (error) {
      console.error('Error saving campaign cache:', error);
    }
  }

  /**
   * Parse campaign group from campaign name
   * Regel: Ta allt före första bindestreck
   *
   * @param {string} campaignName - Full campaign name
   * @returns {string} - Campaign group
   */
  parseCampaignGroup(campaignName) {
    if (!campaignName) return 'Unknown';

    // Ta allt före första ' - '
    const parts = campaignName.split(' - ');
    return parts[0].trim();
  }

  /**
   * Get campaign info from cache or fetch from Adversus API
   *
   * @param {string} campaignId - Campaign ID
   * @param {object} adversusAPI - Adversus API instance
   * @returns {Promise<object>} - { name, group, fetchedAt }
   */
  async getCampaignInfo(campaignId, adversusAPI) {
    if (!campaignId) {
      return { name: 'Unknown', group: 'Unknown', fetchedAt: null };
    }

    // Check in-memory cache
    if (this.campaigns.has(campaignId)) {
      const cached = this.campaigns.get(campaignId);

      // Cache för 24 timmar
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (age < maxAge) {
        return cached;
      }
    }

    // Fetch from Adversus API
    try {
      console.log(`🔍 Fetching campaign ${campaignId} from Adversus...`);
      const response = await adversusAPI.request(`/campaigns/${campaignId}`);

      // Response is an array: [{ id, settings: { name, ... } }]
      let campaign = null;
      if (Array.isArray(response)) {
        campaign = response[0];
      } else if (response.campaigns && Array.isArray(response.campaigns)) {
        campaign = response.campaigns[0];
      }

      if (!campaign) {
        console.log(`⚠️  Campaign ${campaignId} not found in Adversus`);
        return { name: 'Unknown', group: 'Unknown', fetchedAt: null };
      }

      const campaignName = campaign.settings?.name || campaign.settings?.navn || campaign.name || 'Unknown';
      const campaignGroup = this.parseCampaignGroup(campaignName);

      const campaignInfo = {
        name: campaignName,
        group: campaignGroup,
        fetchedAt: new Date().toISOString()
      };

      // Save to cache
      this.campaigns.set(campaignId, campaignInfo);
      await this.saveCache();

      console.log(`✅ Cached campaign: ${campaignName} → ${campaignGroup}`);

      return campaignInfo;
    } catch (error) {
      console.error(`❌ Error fetching campaign ${campaignId}:`, error.message);
      return { name: 'Unknown', group: 'Unknown', fetchedAt: null };
    }
  }

  /**
   * Get campaign group (convenience method)
   */
  async getCampaignGroup(campaignId, adversusAPI) {
    const info = await this.getCampaignInfo(campaignId, adversusAPI);
    return info.group;
  }

  /**
   * Clear cache
   */
  async clearCache() {
    this.campaigns.clear();
    await this.saveCache();
    console.log('🗑️  Campaign cache cleared');
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      totalCampaigns: this.campaigns.size,
      campaigns: Array.from(this.campaigns.entries()).map(([id, info]) => ({
        id,
        name: info.name,
        group: info.group,
        age: Math.round((Date.now() - new Date(info.fetchedAt).getTime()) / 1000 / 60) + ' min'
      }))
    };
  }
}

module.exports = new CampaignCache();
