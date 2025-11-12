const express = require('express');
const router = express.Router();
const multer = require('multer');
const { logoStorage } = require('../../config/cloudinary');
const companyLogosService = require('../../services/companyLogos');

// Multer upload for logos
const upload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get all company logos
router.get('/', async (req, res) => {
  try {
    const logos = await companyLogosService.getLogos();
    res.json({ logos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single company logo
router.get('/:id', async (req, res) => {
  try {
    const logo = await companyLogosService.getLogo(req.params.id);
    if (!logo) {
      return res.status(404).json({ error: 'Logo not found' });
    }
    res.json(logo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload new company logo
router.post('/upload', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file provided' });
    }

    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Logo name is required' });
    }

    const logoData = {
      name: name.trim(),
      url: req.file.path // Cloudinary URL
    };

    const logo = await companyLogosService.addLogo(logoData);
    res.json(logo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update company logo (name only)
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Logo name is required' });
    }

    const logo = await companyLogosService.updateLogo(req.params.id, {
      name: name.trim()
    });

    res.json(logo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete company logo
router.delete('/:id', async (req, res) => {
  try {
    await companyLogosService.deleteLogo(req.params.id);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('is used by')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
