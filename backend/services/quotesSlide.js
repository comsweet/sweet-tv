const fs = require('fs').promises;
const path = require('path');
const postgres = require('./postgres');

class QuotesSlideService {
  constructor() {
    // PERSISTENT DISK på Render!
    const isRender = process.env.RENDER === 'true';

    this.dbPath = isRender
      ? '/var/data'
      : path.join(__dirname, '../data');

    this.configFile = path.join(this.dbPath, 'quotesSlideConfig.json');

    console.log(`💾 Quotes slide config path: ${this.dbPath} (isRender: ${isRender})`);
    console.log(`📊 Quotes library: Postgres database`);

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
          selectedQuoteIds: [] // Changed from selectedQuotes to selectedQuoteIds (array of IDs)
        };
        await fs.writeFile(this.configFile, JSON.stringify(defaultConfig, null, 2));
        console.log('📝 Created quotesSlideConfig.json with defaults');
      }

      // Ensure Postgres is initialized
      await postgres.init();

      // Check quotes count
      const count = await postgres.getQuotesCount();
      console.log(`📚 Quotes in database: ${count}`);

      if (count === 0) {
        console.log('⚠️  No quotes in database! Run: node backend/scripts/migrate-quotes.js');
      }
    } catch (error) {
      console.error('Error initializing quotes slide database:', error);
    }
  }

  async getConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');

      // Try to parse normally first
      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.warn('⚠️  JSON parse failed, attempting to repair...', parseError.message);

        // Try to fix common JSON issues
        let repairedData = data
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/\/\/.*/g, '') // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
          .trim();

        try {
          const repaired = JSON.parse(repairedData);
          console.log('✅ Successfully repaired JSON, saving fixed version...');

          // Save the repaired version
          await fs.writeFile(this.configFile, JSON.stringify(repaired, null, 2));
          console.log('💾 Saved repaired quotesSlideConfig.json');

          return repaired;
        } catch (repairError) {
          console.error('❌ Could not repair JSON, recreating from defaults...');

          // Complete failure - recreate from defaults
          const defaultConfig = {
            enabled: false,
            mode: 'random',
            refreshInterval: 3600000,
            lastRefresh: new Date().toISOString(),
            selectedQuoteIds: []
          };

          await fs.writeFile(this.configFile, JSON.stringify(defaultConfig, null, 2));
          console.log('✅ Recreated quotesSlideConfig.json with defaults');

          return defaultConfig;
        }
      }
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

  // Välj 2 random citat från databasen (prioriterar quotes som visats minst)
  async selectRandomQuotes(count = 2) {
    try {
      const activeQuotes = await postgres.getActiveQuotes();

      if (activeQuotes.length === 0) {
        return [];
      }

      // Shuffle and take first 'count' quotes
      const shuffled = [...activeQuotes].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Math.min(count, activeQuotes.length));

      // Increment times_shown for selected quotes
      for (const quote of selected) {
        await postgres.incrementQuoteTimesShown(quote.id);
      }

      return selected;
    } catch (error) {
      console.error('Error selecting random quotes:', error);
      return [];
    }
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

    // Om manual mode, hämta de valda citaten från databasen
    if (config.mode === 'manual') {
      const quoteIds = config.selectedQuoteIds || [];
      const quotes = [];

      for (const id of quoteIds) {
        const quote = await postgres.getQuote(id);
        if (quote) {
          quotes.push(quote);
        }
      }

      return {
        quotes: quotes,
        config: config
      };
    }

    // Om random mode, kolla om refresh behövs
    const now = new Date().getTime();
    const lastRefresh = new Date(config.lastRefresh).getTime();
    const timeSinceRefresh = now - lastRefresh;

    // Om det är dags för refresh (eller om inga citat är valda)
    if (timeSinceRefresh >= config.refreshInterval || !config.selectedQuoteIds || config.selectedQuoteIds.length === 0) {
      console.log('🔄 Refreshing random quotes...');
      const newQuotes = await this.selectRandomQuotes(2);
      const newQuoteIds = newQuotes.map(q => q.id);

      await this.updateConfig({
        selectedQuoteIds: newQuoteIds,
        lastRefresh: new Date().toISOString()
      });

      return {
        quotes: newQuotes,
        config: { ...config, selectedQuoteIds: newQuoteIds, lastRefresh: new Date().toISOString() }
      };
    }

    // Annars hämta befintliga citat från databasen
    const quoteIds = config.selectedQuoteIds || [];
    const quotes = [];

    for (const id of quoteIds) {
      const quote = await postgres.getQuote(id);
      if (quote) {
        quotes.push(quote);
      }
    }

    return {
      quotes: quotes,
      config: config
    };
  }

  // Manuell refresh (välj nya random citat direkt)
  async refreshNow() {
    const newQuotes = await this.selectRandomQuotes(2);
    const newQuoteIds = newQuotes.map(q => q.id);

    const config = await this.updateConfig({
      selectedQuoteIds: newQuoteIds,
      lastRefresh: new Date().toISOString()
    });

    console.log('✨ Manually refreshed quotes');
    return {
      quotes: newQuotes,
      config: config
    };
  }

  // Hämta alla tillgängliga citat (för admin UI)
  async getAllQuotes() {
    try {
      return await postgres.getAllQuotes();
    } catch (error) {
      console.error('Error getting all quotes:', error);
      return [];
    }
  }
}

module.exports = new QuotesSlideService();
