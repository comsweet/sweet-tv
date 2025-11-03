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
    const quotes = quotesSlideService.getAllQuotes();
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
