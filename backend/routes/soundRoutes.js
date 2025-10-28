// SOUND MANAGEMENT API ROUTES
// Add these to your existing api.js routes

const soundSettings = require('../services/soundSettings');
const soundLibrary = require('../services/soundLibrary');
const { soundStorage } = require('../config/cloudinary');
const multer = require('multer');

// Multer upload för ljud (max 2MB, 5 sekunder validering görs på frontend)
const uploadSound = multer({ 
  storage: soundStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, and OGG allowed.'));
    }
  }
});

// ==================== SOUND SETTINGS ====================

// GET sound settings
router.get('/sounds/settings', async (req, res) => {
  try {
    const settings = await soundSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE sound settings
router.put('/sounds/settings', async (req, res) => {
  try {
    const settings = await soundSettings.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SET default sound
router.put('/sounds/settings/default', async (req, res) => {
  try {
    const { soundUrl } = req.body;
    const settings = await soundSettings.setDefaultSound(soundUrl);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SET milestone sound
router.put('/sounds/settings/milestone', async (req, res) => {
  try {
    const { soundUrl } = req.body;
    const settings = await soundSettings.setMilestoneSound(soundUrl);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SET daily budget
router.put('/sounds/settings/budget', async (req, res) => {
  try {
    const { amount } = req.body;
    const settings = await soundSettings.setDailyBudget(amount);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SOUND LIBRARY ====================

// GET all sounds
router.get('/sounds', async (req, res) => {
  try {
    const sounds = await soundLibrary.getSounds();
    res.json(sounds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single sound
router.get('/sounds/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.getSound(req.params.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPLOAD new sound
router.post('/sounds/upload', uploadSound.single('sound'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Cloudinary returnerar URL i req.file.path
    const soundUrl = req.file.path;
    const originalName = req.file.originalname;
    
    console.log(`🎵 Uploaded sound to Cloudinary: ${soundUrl}`);
    
    // Spara i sound library
    const sound = await soundLibrary.addSound({
      name: originalName,
      url: soundUrl,
      duration: null // Duration måste sättas på frontend
    });
    
    res.json(sound);
  } catch (error) {
    console.error('Error uploading sound:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE sound
router.delete('/sounds/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.getSound(req.params.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    
    // OPTIONAL: Radera från Cloudinary också
    if (sound.url && sound.url.includes('cloudinary')) {
      try {
        const urlParts = sound.url.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `sweet-tv-sounds/${filename.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        console.log(`🗑️  Deleted sound from Cloudinary: ${publicId}`);
      } catch (deleteError) {
        console.error('⚠️  Could not delete sound from Cloudinary:', deleteError.message);
      }
    }
    
    await soundLibrary.deleteSound(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LINK agent to sound
router.post('/sounds/:id/link-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const sound = await soundLibrary.linkAgent(req.params.id, userId);
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UNLINK agent from sound
router.post('/sounds/:id/unlink-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const sound = await soundLibrary.unlinkAgent(req.params.id, userId);
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE sound metadata
router.put('/sounds/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.updateSound(req.params.id, req.body);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET sound for specific agent
router.get('/sounds/agent/:userId', async (req, res) => {
  try {
    const sound = await soundLibrary.getSoundForAgent(req.params.userId);
    res.json(sound || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE agent sound preferences
router.put('/agents/:userId/sound-preferences', async (req, res) => {
  try {
    const { preferCustomSound } = req.body;
    const agent = await database.updateAgent(req.params.userId, {
      preferCustomSound: preferCustomSound
    });
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
