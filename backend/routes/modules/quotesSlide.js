const express = require('express');
const router = express.Router();
const quotesSlideService = require('../../services/quotesSlide');

// ==================== QUOTES SLIDE ====================

// Get current quotes and config
router.get('/current', async (req, res) => {
  try {
    const result = await quotesSlideService.getCurrentQuotes();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get config only
router.get('/config', async (req, res) => {
  try {
    const config = await quotesSlideService.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update config
router.put('/config', async (req, res) => {
  try {
    const config = await quotesSlideService.updateConfig(req.body);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh quotes now (manual refresh)
router.post('/refresh', async (req, res) => {
  try {
    const result = await quotesSlideService.refreshNow();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all available quotes (for admin UI)
router.get('/all', async (req, res) => {
  try {
    const quotes = await quotesSlideService.getAllQuotes();
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUOTES CRUD (Admin UI) ====================

const postgres = require('../../services/postgres');

// Create new quote
router.post('/quote', async (req, res) => {
  try {
    const { quote, attribution, active } = req.body;

    if (!quote || !attribution) {
      return res.status(400).json({ error: 'Quote and attribution are required' });
    }

    const newQuote = await postgres.createQuote({ quote, attribution, active });
    res.json(newQuote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single quote
router.get('/quote/:id', async (req, res) => {
  try {
    const quote = await postgres.getQuote(req.params.id);

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update quote
router.put('/quote/:id', async (req, res) => {
  try {
    const { quote, attribution, active } = req.body;
    const updates = {};

    if (quote !== undefined) updates.quote = quote;
    if (attribution !== undefined) updates.attribution = attribution;
    if (active !== undefined) updates.active = active;

    const updatedQuote = await postgres.updateQuote(req.params.id, updates);

    if (!updatedQuote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json(updatedQuote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete quote
router.delete('/quote/:id', async (req, res) => {
  try {
    await postgres.deleteQuote(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
