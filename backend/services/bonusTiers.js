const fs = require('fs').promises;
const path = require('path');

// Determine data directory based on environment
const DATA_DIR = process.env.RENDER
  ? '/var/data'  // Render persistent disk
  : path.join(__dirname, '../data'); // Local development

const BONUS_TIERS_FILE = path.join(DATA_DIR, 'bonus-tiers.json');

/**
 * Bonus Tiers Service
 * Hanterar bonustrappor för agenter baserat på försäljning
 */
class BonusTiersService {
  constructor() {
    this.tiers = [];
    this.init();
  }

  async init() {
    try {
      await this.loadTiers();
      console.log(`✅ Loaded ${this.tiers.length} bonus tiers`);
    } catch (error) {
      console.error('Error initializing bonus tiers:', error);
      await this.createDefaultTiers();
    }
  }

  async loadTiers() {
    try {
      const data = await fs.readFile(BONUS_TIERS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      this.tiers = parsed.tiers || [];

      // Sortera efter threshold
      this.tiers.sort((a, b) => a.threshold - b.threshold);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create default
        await this.createDefaultTiers();
      } else {
        throw error;
      }
    }
  }

  async saveTiers() {
    const data = {
      tiers: this.tiers,
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(BONUS_TIERS_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Saved ${this.tiers.length} bonus tiers`);
  }

  async createDefaultTiers() {
    this.tiers = [
      {
        id: Date.now().toString(),
        name: 'Start',
        threshold: 0,
        bonus: 0,
        color: '#95a5a6',
        icon: '🌱'
      },
      {
        id: (Date.now() + 1).toString(),
        name: 'Brons',
        threshold: 50000,
        bonus: 2000,
        color: '#CD7F32',
        icon: '🥉'
      },
      {
        id: (Date.now() + 2).toString(),
        name: 'Silver',
        threshold: 100000,
        bonus: 5000,
        color: '#C0C0C0',
        icon: '🥈'
      },
      {
        id: (Date.now() + 3).toString(),
        name: 'Guld',
        threshold: 150000,
        bonus: 10000,
        color: '#FFD700',
        icon: '🥇'
      },
      {
        id: (Date.now() + 4).toString(),
        name: 'Platina',
        threshold: 200000,
        bonus: 20000,
        color: '#E5E4E2',
        icon: '💎'
      }
    ];
    await this.saveTiers();
    console.log('✅ Created default bonus tiers');
  }

  /**
   * Hämta alla bonustrappor
   */
  getTiers() {
    return this.tiers;
  }

  /**
   * Hämta en specifik tier
   */
  getTier(id) {
    return this.tiers.find(t => t.id === id);
  }

  /**
   * Lägg till ny tier
   */
  async addTier(tierData) {
    const newTier = {
      id: Date.now().toString(),
      name: tierData.name,
      threshold: parseFloat(tierData.threshold) || 0,
      bonus: parseFloat(tierData.bonus) || 0,
      color: tierData.color || '#667eea',
      icon: tierData.icon || '⭐',
      createdAt: new Date().toISOString()
    };

    this.tiers.push(newTier);
    this.tiers.sort((a, b) => a.threshold - b.threshold);
    await this.saveTiers();

    return newTier;
  }

  /**
   * Uppdatera tier
   */
  async updateTier(id, updates) {
    const index = this.tiers.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Tier not found');
    }

    this.tiers[index] = {
      ...this.tiers[index],
      ...updates,
      threshold: parseFloat(updates.threshold) || this.tiers[index].threshold,
      bonus: parseFloat(updates.bonus) || this.tiers[index].bonus,
      updatedAt: new Date().toISOString()
    };

    this.tiers.sort((a, b) => a.threshold - b.threshold);
    await this.saveTiers();

    return this.tiers[index];
  }

  /**
   * Ta bort tier
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
   * Beräkna vilken tier en agent är på baserat på commission
   * @param {number} totalCommission - Agentens totala commission
   * @returns {object} - Tier-objekt med extra info
   */
  calculateTierForCommission(totalCommission) {
    if (!totalCommission || totalCommission === 0) {
      const lowestTier = this.tiers[0] || { name: 'N/A', threshold: 0, bonus: 0 };
      return {
        ...lowestTier,
        nextTier: this.tiers[1] || null,
        progressToNext: 0,
        remainingToNext: this.tiers[1]?.threshold || 0
      };
    }

    // Hitta current tier (högsta tier som uppnåtts)
    let currentTier = this.tiers[0];
    for (const tier of this.tiers) {
      if (totalCommission >= tier.threshold) {
        currentTier = tier;
      } else {
        break;
      }
    }

    // Hitta next tier
    const currentIndex = this.tiers.indexOf(currentTier);
    const nextTier = this.tiers[currentIndex + 1] || null;

    // Beräkna progress
    let progressToNext = 100;
    let remainingToNext = 0;

    if (nextTier) {
      const tierRange = nextTier.threshold - currentTier.threshold;
      const currentProgress = totalCommission - currentTier.threshold;
      progressToNext = (currentProgress / tierRange) * 100;
      remainingToNext = nextTier.threshold - totalCommission;
    }

    return {
      ...currentTier,
      nextTier,
      progressToNext: Math.min(100, progressToNext),
      remainingToNext: Math.max(0, remainingToNext)
    };
  }

  /**
   * Hämta statistik för alla tiers
   */
  async getTiersStats() {
    return {
      totalTiers: this.tiers.length,
      highestBonus: Math.max(...this.tiers.map(t => t.bonus)),
      highestThreshold: Math.max(...this.tiers.map(t => t.threshold))
    };
  }
}

module.exports = new BonusTiersService();
