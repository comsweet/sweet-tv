const express = require('express');
const router = express.Router();
const multer = require('multer');
const { cloudinary, logoStorage } = require('../../config/cloudinary');
const logoSettings = require('../../services/logoSettings');

// Multer upload med Cloudinary (max 5MB)
const upload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ==================== LOGOS ====================

// Get logo settings
router.get('/', async (req, res) => {
  try {
    const settings = await logoSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload company logo (left side)
router.post('/company', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo provided' });
    }

    const logoUrl = req.file.path;
    const settings = await logoSettings.setCompanyLogo(logoUrl);

    console.log(`✅ Company logo uploaded: ${logoUrl}`);
    res.json({ logoUrl, settings });
  } catch (error) {
    console.error('Error uploading company logo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload brand mark (right side)
router.post('/brand', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo provided' });
    }

    const markUrl = req.file.path;
    const settings = await logoSettings.setBrandMark(markUrl);

    console.log(`✅ Brand mark uploaded: ${markUrl}`);
    res.json({ markUrl, settings });
  } catch (error) {
    console.error('Error uploading brand mark:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete company logo
router.delete('/company', async (req, res) => {
  try {
    const currentSettings = await logoSettings.getSettings();

    // Delete from Cloudinary if exists
    if (currentSettings.companyLogo && currentSettings.companyLogo.includes('cloudinary')) {
      try {
        const urlParts = currentSettings.companyLogo.split('/');
        const publicIdWithExt = urlParts[urlParts.length - 1];
        const publicId = publicIdWithExt.split('.')[0];
        const folder = 'sweet-tv-logos';
        const fullPublicId = `${folder}/${publicId}`;

        await cloudinary.uploader.destroy(fullPublicId);
        console.log(`🗑️  Deleted company logo from Cloudinary: ${fullPublicId}`);
      } catch (error) {
        console.error('⚠️  Failed to delete from Cloudinary:', error.message);
      }
    }

    const settings = await logoSettings.clearCompanyLogo();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error deleting company logo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete brand mark
router.delete('/brand', async (req, res) => {
  try {
    const currentSettings = await logoSettings.getSettings();

    // Delete from Cloudinary if exists
    if (currentSettings.brandMark && currentSettings.brandMark.includes('cloudinary')) {
      try {
        const urlParts = currentSettings.brandMark.split('/');
        const publicIdWithExt = urlParts[urlParts.length - 1];
        const publicId = publicIdWithExt.split('.')[0];
        const folder = 'sweet-tv-logos';
        const fullPublicId = `${folder}/${publicId}`;

        await cloudinary.uploader.destroy(fullPublicId);
        console.log(`🗑️  Deleted brand mark from Cloudinary: ${fullPublicId}`);
      } catch (error) {
        console.error('⚠️  Failed to delete from Cloudinary:', error.message);
      }
    }

    const settings = await logoSettings.clearBrandMark();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error deleting brand mark:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
