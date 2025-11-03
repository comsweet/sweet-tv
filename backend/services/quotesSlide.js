const fs = require('fs').promises;
const path = require('path');

class QuotesSlideService {
  constructor() {
    // PERSISTENT DISK på Render!
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.configFile = path.join(this.dbPath, 'quotesSlideConfig.json');
    this.quotesFile = path.join(__dirname, '../../frontend/public/data/quotes.json');

    console.log(`💾 Quotes slide config path: ${this.dbPath} (isRender: ${isRender})`);
    console.log(`📖 Quotes library path: ${this.quotesFile}`);

    this.allQuotes = null; // Cache för alla citat
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Skapa quotesSlideConfig.json om den inte finns
      try {
        await fs.access(this.configFile);
        console.log('✅ quotesSlideConfig.json exists');
      } catch {
        const defaultConfig = {
          enabled: false,
          mode: 'random', // 'random' eller 'manual'
          refreshInterval: 3600000, // 1 timme i millisekunder
          lastRefresh: new Date().toISOString(),
          selectedQuotes: []
        };
        await fs.writeFile(this.configFile, JSON.stringify(defaultConfig, null, 2));
        console.log('📝 Created quotesSlideConfig.json with defaults');
      }

      // Ladda alla citat från quotes.json
      await this.loadAllQuotes();
    } catch (error) {
      console.error('Error initializing quotes slide database:', error);
    }
  }

  async loadAllQuotes() {
    try {
      const data = await fs.readFile(this.quotesFile, 'utf8');
      this.allQuotes = JSON.parse(data);
      console.log(`📚 Loaded ${this.allQuotes.length} quotes from library`);
    } catch (error) {
      console.error('Error loading quotes library:', error);
      this.allQuotes = [];
    }
  }

  async getConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading quotes slide config:', error);
      throw error;
    }
  }

  async updateConfig(updates) {
    try {
      const config = await this.getConfig();
      const newConfig = {
        ...config,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(this.configFile, JSON.stringify(newConfig, null, 2));
      console.log(`💾 Updated quotes slide config on persistent disk`);
      return newConfig;
    } catch (error) {
      console.error('Error updating quotes slide config:', error);
      throw error;
    }
  }

  // Välj 2 random citat från biblioteket
  selectRandomQuotes(count = 2) {
    if (!this.allQuotes || this.allQuotes.length === 0) {
      return [];
    }

    const shuffled = [...this.allQuotes].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, this.allQuotes.length));
  }

  // Hämta aktuella citat (kontrollera om refresh behövs)
  async getCurrentQuotes() {
    const config = await this.getConfig();

    // Om disabled, returnera tom array
    if (!config.enabled) {
      return {
        quotes: [],
        config: config
      };
    }

    // Om manual mode, returnera de valda citaten
    if (config.mode === 'manual') {
      return {
        quotes: config.selectedQuotes || [],
        config: config
      };
    }

    // Om random mode, kolla om refresh behövs
    const now = new Date().getTime();
    const lastRefresh = new Date(config.lastRefresh).getTime();
    const timeSinceRefresh = now - lastRefresh;

    // Om det är dags för refresh (eller om inga citat är valda)
    if (timeSinceRefresh >= config.refreshInterval || !config.selectedQuotes || config.selectedQuotes.length === 0) {
      console.log('🔄 Refreshing random quotes...');
      const newQuotes = this.selectRandomQuotes(2);

      await this.updateConfig({
        selectedQuotes: newQuotes,
        lastRefresh: new Date().toISOString()
      });

      return {
        quotes: newQuotes,
        config: { ...config, selectedQuotes: newQuotes, lastRefresh: new Date().toISOString() }
      };
    }

    // Annars returnera befintliga citat
    return {
      quotes: config.selectedQuotes,
      config: config
    };
  }

  // Manuell refresh (välj nya random citat direkt)
  async refreshNow() {
    const newQuotes = this.selectRandomQuotes(2);

    const config = await this.updateConfig({
      selectedQuotes: newQuotes,
      lastRefresh: new Date().toISOString()
    });

    console.log('✨ Manually refreshed quotes');
    return {
      quotes: newQuotes,
      config: config
    };
  }

  // Hämta alla tillgängliga citat (för admin UI)
  getAllQuotes() {
    return this.allQuotes || [];
  }
}

module.exports = new QuotesSlideService();
