const fs = require('fs').promises;
const path = require('path');

const THRESHOLDS_FILE = process.env.THRESHOLDS_FILE || path.join(__dirname, '../data/thresholds.json');

/**
 * Service för att hantera tröskelvärden för färgkodning
 * Globala tröskelvärden per tidsperiod (day, week, month)
 */
class ThresholdsService {
  constructor() {
    this.thresholds = null;
    this.defaultThresholds = {
      day: {
        total: { green: 3000 },      // Grön >= 3000, Orange < 3000 && > 0, Röd = 0
        sms: { green: 75, orange: 60 } // Grön >= 75%, Orange >= 60%, Röd < 60%
      },
      week: {
        total: { green: 15000 },
        sms: { green: 75, orange: 60 }
      },
      month: {
        total: { green: 50000 },
        sms: { green: 75, orange: 60 }
      }
    };
  }

  /**
   * Load thresholds from file
   */
  async load() {
    try {
      const data = await fs.readFile(THRESHOLDS_FILE, 'utf-8');
      this.thresholds = JSON.parse(data);
      console.log('✅ Thresholds loaded from file');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Thresholds file not found, using defaults');
        this.thresholds = this.defaultThresholds;
        await this.save();
      } else {
        console.error('❌ Error loading thresholds:', error);
        this.thresholds = this.defaultThresholds;
      }
    }
  }

  /**
   * Save thresholds to file
   */
  async save() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(THRESHOLDS_FILE);
      await fs.mkdir(dataDir, { recursive: true });

      await fs.writeFile(THRESHOLDS_FILE, JSON.stringify(this.thresholds, null, 2));
      console.log('✅ Thresholds saved to file');
    } catch (error) {
      console.error('❌ Error saving thresholds:', error);
      throw error;
    }
  }

  /**
   * Get all thresholds
   */
  async getThresholds() {
    if (!this.thresholds) {
      await this.load();
    }
    return this.thresholds;
  }

  /**
   * Get thresholds for specific time period
   */
  async getThresholdsForPeriod(timePeriod) {
    const thresholds = await this.getThresholds();
    return thresholds[timePeriod] || thresholds.day;
  }

  /**
   * Update thresholds for specific time period
   */
  async updateThresholds(timePeriod, newThresholds) {
    if (!this.thresholds) {
      await this.load();
    }

    // Validate time period
    if (!['day', 'week', 'month'].includes(timePeriod)) {
      throw new Error('Invalid time period. Must be day, week, or month.');
    }

    // Validate structure
    if (!newThresholds.total || typeof newThresholds.total.green !== 'number') {
      throw new Error('Invalid threshold structure. total.green must be a number.');
    }

    if (!newThresholds.sms ||
        typeof newThresholds.sms.green !== 'number' ||
        typeof newThresholds.sms.orange !== 'number') {
      throw new Error('Invalid threshold structure. sms.green and sms.orange must be numbers.');
    }

    this.thresholds[timePeriod] = newThresholds;
    await this.save();

    console.log(`✅ Thresholds updated for ${timePeriod}:`, newThresholds);
    return this.thresholds[timePeriod];
  }

  /**
   * Reset thresholds to defaults
   */
  async reset() {
    this.thresholds = this.defaultThresholds;
    await this.save();
    console.log('✅ Thresholds reset to defaults');
    return this.thresholds;
  }
}

module.exports = new ThresholdsService();
