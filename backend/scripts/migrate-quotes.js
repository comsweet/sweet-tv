// backend/scripts/migrate-quotes.js
// Migration script to import quotes from JSON file to Postgres database

const fs = require('fs').promises;
const path = require('path');
const postgres = require('../services/postgres');

async function migrateQuotes() {
  console.log('\n🔄 ═══════════════════════════════════════════');
  console.log('🔄 QUOTES MIGRATION - JSON to Postgres');
  console.log('═══════════════════════════════════════════\n');

  try {
    // Initialize Postgres connection
    console.log('📊 Initializing Postgres connection...');
    await postgres.init();

    // Check if quotes already exist
    const existingCount = await postgres.getQuotesCount();
    console.log(`📚 Current quotes in database: ${existingCount}`);

    if (existingCount > 0) {
      console.log('\n⚠️  WARNING: Quotes already exist in database!');
      console.log('This script will add MORE quotes to the existing ones.');
      console.log('If you want to start fresh, manually DELETE FROM quotes; first.\n');

      // Ask for confirmation (in production, you'd want proper prompts)
      // For now, we'll just continue
    }

    // Read quotes from JSON file
    const quotesFilePath = path.join(__dirname, '../../frontend/public/data/quotes.json');
    console.log(`📖 Reading quotes from: ${quotesFilePath}`);

    const fileContent = await fs.readFile(quotesFilePath, 'utf8');
    const quotes = JSON.parse(fileContent);

    console.log(`✅ Loaded ${quotes.length} quotes from JSON file\n`);

    // Batch insert quotes
    console.log('💾 Inserting quotes into Postgres database...');
    const startTime = Date.now();

    await postgres.batchInsertQuotes(quotes);

    const duration = Date.now() - startTime;
    console.log(`✅ Successfully inserted ${quotes.length} quotes in ${duration}ms\n`);

    // Verify final count
    const finalCount = await postgres.getQuotesCount();
    console.log(`📊 Final quote count in database: ${finalCount}`);

    // Show some sample quotes
    const samples = await postgres.query('SELECT * FROM quotes ORDER BY RANDOM() LIMIT 3');
    console.log('\n🎯 Sample quotes from database:');
    samples.rows.forEach((quote, i) => {
      console.log(`  ${i + 1}. "${quote.quote}" — ${quote.attribution}`);
    });

    console.log('\n✅ ═══════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE!');
    console.log('═══════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ═══════════════════════════════════════════');
    console.error('❌ MIGRATION FAILED!');
    console.error('═══════════════════════════════════════════');
    console.error(error);
    console.error('');

    process.exit(1);
  }
}

// Run migration
migrateQuotes();
