const fs = require('fs').promises;
const path = require('path');

/**
 * CAMPAIGN BONUS TIERS SERVICE
 *
 * Hanterar bonustrappor baserat på kampanj-grupper och antal deals per dag
 *
 * Exempel struktur:
 * {
 *   id: "tier_1",
 *   campaignGroup: "Dentle Kallkund",
 *   enabled: true,
 *   tiers: [
 *     { deals: 3, bonusPerDeal: 300 },
 *     { deals: 4, bonusPerDeal: 350 },
 *     { deals: 5, bonusPerDeal: 400 }
 *   ],
 *   maxDeals: 8
 * }
 *
 * Bonus beräkning:
 * - RETROAKTIV: När agent når 4 deals får de 350 THB för ALLA 4 deals (= 1400 THB)
 * - Efter maxDeals fortsätter sista tier-bonusen
 */
class CampaignBonusTiersService {
  constructor() {
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.tiersFile = path.join(this.dbPath, 'campaign-bonus-tiers.json');

    this.tiers = [];

    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        const data = await fs.readFile(this.tiersFile, 'utf8');
        const parsed = JSON.parse(data);
        this.tiers = parsed.tiers || [];

        console.log(`✅ Loaded ${this.tiers.length} campaign bonus tier configs`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          await this.createDefaultTiers();
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error initializing campaign bonus tiers:', error);
    }
  }

  async saveTiers() {
    try {
      await fs.writeFile(
        this.tiersFile,
        JSON.stringify({ tiers: this.tiers, updatedAt: new Date().toISOString() }, null, 2)
      );
      console.log(`💾 Saved ${this.tiers.length} campaign bonus tiers`);
    } catch (error) {
      console.error('Error saving campaign bonus tiers:', error);
    }
  }

  async createDefaultTiers() {
    this.tiers = [
      {
        id: Date.now().toString(),
        campaignGroup: 'Dentle Kallkund',
        enabled: true,
        tiers: [
          { deals: 3, bonusPerDeal: 300 },
          { deals: 4, bonusPerDeal: 350 },
          { deals: 5, bonusPerDeal: 400 },
          { deals: 8, bonusPerDeal: 500 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: (Date.now() + 1).toString(),
        campaignGroup: 'Sinfrid Varmkund',
        enabled: true,
        tiers: [
          { deals: 5, bonusPerDeal: 250 },
          { deals: 7, bonusPerDeal: 300 },
          { deals: 10, bonusPerDeal: 350 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: (Date.now() + 2).toString(),
        campaignGroup: 'Sinfrid Kallkund',
        enabled: true,
        tiers: [
          { deals: 3, bonusPerDeal: 200 },
          { deals: 4, bonusPerDeal: 250 },
          { deals: 5, bonusPerDeal: 300 },
          { deals: 6, bonusPerDeal: 350 }
        ],
        createdAt: new Date().toISOString()
      }
    ];

    await this.saveTiers();
    console.log('✅ Created default campaign bonus tiers');
  }

  /**
   * Get all tiers
   */
  getTiers() {
    return this.tiers;
  }

  /**
   * Get specific tier by ID
   */
  getTier(id) {
    return this.tiers.find(t => t.id === id);
  }

  /**
   * Get tier config for a campaign group
   */
  getTierForCampaignGroup(campaignGroup) {
    return this.tiers.find(t => t.campaignGroup === campaignGroup && t.enabled);
  }

  /**
   * Add new tier
   */
  async addTier(tierData) {
    const newTier = {
      id: Date.now().toString(),
      campaignGroup: tierData.campaignGroup,
      enabled: tierData.enabled !== undefined ? tierData.enabled : true,
      tiers: tierData.tiers || [],
      createdAt: new Date().toISOString()
    };

    // Sort tiers by deals ascending
    newTier.tiers.sort((a, b) => a.deals - b.deals);

    this.tiers.push(newTier);
    await this.saveTiers();

    return newTier;
  }

  /**
   * Update tier
   */
  async updateTier(id, updates) {
    const index = this.tiers.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Tier not found');
    }

    this.tiers[index] = {
      ...this.tiers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Sort tiers if updated
    if (updates.tiers) {
      this.tiers[index].tiers.sort((a, b) => a.deals - b.deals);
    }

    await this.saveTiers();

    return this.tiers[index];
  }

  /**
   * Delete tier
   */
  async deleteTier(id) {
    const initialLength = this.tiers.length;
    this.tiers = this.tiers.filter(t => t.id !== id);

    if (this.tiers.length === initialLength) {
      throw new Error('Tier not found');
    }

    await this.saveTiers();
  }

  /**
   * Calculate bonus for a given campaign group and deal count
   *
   * @param {string} campaignGroup - Campaign group name
   * @param {number} dealsCount - Number of deals
   * @returns {number} - Total bonus amount
   *
   * Exempel:
   * - Tiers: [3→300, 4→350, 5→400, 8→500]
   * - dealsCount: 4 → 4 * 350 = 1400 THB
   * - dealsCount: 6 → 6 * 400 = 2400 THB (använder tier 5)
   * - dealsCount: 10 → 10 * 500 = 5000 THB (fortsätter med tier 8)
   */
  calculateBonusForDeals(campaignGroup, dealsCount) {
    const tierConfig = this.getTierForCampaignGroup(campaignGroup);

    if (!tierConfig || dealsCount === 0) {
      return 0;
    }

    // Find applicable tier (highest tier where deals >= tier.deals)
    let applicableTier = null;
    for (const tier of tierConfig.tiers) {
      if (dealsCount >= tier.deals) {
        applicableTier = tier;
      } else {
        break;
      }
    }

    if (!applicableTier) {
      return 0;
    }

    // Retroaktiv bonus: bonusPerDeal * dealsCount
    // Ingen maxDeals-gräns - bonusen fortsätter efter sista tier
    return applicableTier.bonusPerDeal * dealsCount;
  }

  /**
   * Get tier info for display
   */
  getTierInfoForDeals(campaignGroup, dealsCount) {
    const tierConfig = this.getTierForCampaignGroup(campaignGroup);

    if (!tierConfig) {
      return { bonus: 0, tier: null, nextTier: null };
    }

    const bonus = this.calculateBonusForDeals(campaignGroup, dealsCount);

    // Find current and next tier
    let currentTier = null;
    let nextTier = null;

    for (let i = 0; i < tierConfig.tiers.length; i++) {
      if (dealsCount >= tierConfig.tiers[i].deals) {
        currentTier = tierConfig.tiers[i];
        nextTier = tierConfig.tiers[i + 1] || null;
      }
    }

    return {
      bonus,
      currentTier,
      nextTier
    };
  }

  /**
   * Get all unique campaign groups
   */
  getAllCampaignGroups() {
    return [...new Set(this.tiers.map(t => t.campaignGroup))];
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      totalConfigs: this.tiers.length,
      enabledConfigs: this.tiers.filter(t => t.enabled).length,
      campaignGroups: this.getAllCampaignGroups()
    };
  }
}

module.exports = new CampaignBonusTiersService();
