// backend/scripts/import-quotes2.js
// Script to import additional quotes from quotes2.json to Postgres database
// This ADDS to existing quotes, does not replace them

const fs = require('fs').promises;
const path = require('path');
const postgres = require('../services/postgres');

async function importQuotes2() {
  console.log('\n🔄 ═══════════════════════════════════════════');
  console.log('🔄 QUOTES2 IMPORT - Adding new quotes to database');
  console.log('═══════════════════════════════════════════\n');

  try {
    // Initialize Postgres connection
    console.log('📊 Initializing Postgres connection...');
    await postgres.init();

    // Check current count
    const beforeCount = await postgres.getQuotesCount();
    console.log(`📚 Current quotes in database: ${beforeCount}`);

    // Read quotes from quotes2.json file
    const quotesFilePath = path.join(__dirname, '../../frontend/public/data/quotes2.json');
    console.log(`📖 Reading quotes from: ${quotesFilePath}`);

    let fileContent;
    try {
      fileContent = await fs.readFile(quotesFilePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error('\n❌ ERROR: quotes2.json not found!');
        console.error('Please create the file at:', quotesFilePath);
        console.error('Expected format: [{"quote": "...", "attribution": "..."}]');
        process.exit(1);
      }
      throw error;
    }

    const quotes = JSON.parse(fileContent);
    console.log(`✅ Loaded ${quotes.length} quotes from quotes2.json\n`);

    if (quotes.length === 0) {
      console.log('⚠️  No quotes to import!');
      process.exit(0);
    }

    // Validate format
    const firstQuote = quotes[0];
    if (!firstQuote.quote || !firstQuote.attribution) {
      console.error('\n❌ ERROR: Invalid format in quotes2.json!');
      console.error('Expected format: [{"quote": "...", "attribution": "..."}]');
      process.exit(1);
    }

    // Batch insert quotes
    console.log('💾 Inserting quotes into Postgres database...');
    const startTime = Date.now();

    await postgres.batchInsertQuotes(quotes);

    const duration = Date.now() - startTime;
    console.log(`✅ Successfully inserted ${quotes.length} quotes in ${duration}ms\n`);

    // Verify final count
    const afterCount = await postgres.getQuotesCount();
    console.log(`📊 Before: ${beforeCount} quotes`);
    console.log(`📊 After: ${afterCount} quotes`);
    console.log(`📊 Added: ${afterCount - beforeCount} quotes\n`);

    // Show some sample quotes from the new batch
    const samples = await postgres.query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 3');
    console.log('🎯 Latest quotes in database:');
    samples.rows.forEach((quote, i) => {
      console.log(`  ${i + 1}. "${quote.quote.substring(0, 60)}..." — ${quote.attribution}`);
    });

    console.log('\n✅ ═══════════════════════════════════════════');
    console.log('✅ IMPORT COMPLETE!');
    console.log('═══════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ═══════════════════════════════════════════');
    console.error('❌ IMPORT FAILED!');
    console.error('═══════════════════════════════════════════');
    console.error(error);
    console.error('');

    process.exit(1);
  }
}

// Run import
importQuotes2();
