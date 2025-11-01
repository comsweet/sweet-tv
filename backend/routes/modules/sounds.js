const express = require('express');
const router = express.Router();
const database = require('../../services/database');
const postgres = require('../../services/postgres');
const soundSettings = require('../../services/soundSettings');
const soundLibrary = require('../../services/soundLibrary');
const { cloudinary, soundStorage } = require('../../config/cloudinary');
const { optionalAuth } = require('../../middleware/auth');
const multer = require('multer');

// Multer upload config for sounds (max 2MB)
const uploadSound = multer({
  storage: soundStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
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

// Get sound settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await soundSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update sound settings
router.put('/settings', optionalAuth, async (req, res) => {
  try {
    const oldSettings = await soundSettings.getSettings();
    const settings = await soundSettings.updateSettings(req.body);

    // Audit log for changes (optional - only if user is authenticated)
    if (req.user && req.user.id) {
      try {
        if (oldSettings.defaultSound !== settings.defaultSound) {
          await postgres.createAuditLog({
            userId: req.user.id,
            action: 'UPDATE_DEFAULT_SOUND',
            resourceType: 'sound_settings',
            resourceId: null,
            details: { oldSound: oldSettings.defaultSound, newSound: settings.defaultSound },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          });
        }

        if (oldSettings.dailyBudgetSound !== settings.dailyBudgetSound) {
          await postgres.createAuditLog({
            userId: req.user.id,
            action: 'UPDATE_DAILY_BUDGET_SOUND',
            resourceType: 'sound_settings',
            resourceId: null,
            details: { oldSound: oldSettings.dailyBudgetSound, newSound: settings.dailyBudgetSound },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          });
        }
      } catch (logError) {
        console.error('Failed to create audit log:', logError.message);
      }
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SOUND LIBRARY ====================

// Get all sounds
router.get('/', async (req, res) => {
  try {
    const sounds = await soundLibrary.getSounds();
    res.json(sounds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single sound
router.get('/:id', async (req, res) => {
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

// Upload new sound
router.post('/upload', optionalAuth, uploadSound.single('sound'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const soundUrl = req.file.path;
    const originalName = req.file.originalname;

    console.log(`🎵 Uploaded sound to Cloudinary: ${soundUrl}`);

    const sound = await soundLibrary.addSound({
      name: originalName,
      url: soundUrl,
      duration: null
    });

    // Audit log (optional - only if user is authenticated)
    if (req.user && req.user.id) {
      try {
        await postgres.createAuditLog({
          userId: req.user.id,
          action: 'UPLOAD_SOUND',
          resourceType: 'sound',
          resourceId: sound.id,
          details: { fileName: originalName, url: soundUrl },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
      } catch (logError) {
        console.error('Failed to create audit log:', logError.message);
      }
    }

    res.json(sound);
  } catch (error) {
    console.error('Error uploading sound:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update sound metadata
router.put('/:id', async (req, res) => {
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

// Delete sound
router.delete('/:id', async (req, res) => {
  try {
    const sound = await soundLibrary.getSound(req.params.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }

    // Delete from Cloudinary
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

// ==================== AGENT-SOUND LINKING ====================

// Link agent to sound
router.post('/:id/link-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    console.log(`🔗 Linking agent ${userId} to sound ${req.params.id}`);

    // Step 1: Add to soundLibrary.json
    const sound = await soundLibrary.linkAgent(req.params.id, userId);
    console.log(`✅ Added to sound linkedAgents`);

    // Step 2: Update agents.json to set customSound
    const agent = await database.getAgent(userId);
    if (agent) {
      // If agent already has another customSound, remove from that sound first
      if (agent.customSound && agent.customSound !== sound.url) {
        const sounds = await soundLibrary.getSounds();
        const oldSound = sounds.find(s => s.url === agent.customSound);
        if (oldSound) {
          await soundLibrary.unlinkAgent(oldSound.id, userId);
          console.log(`✅ Removed agent from old sound`);
        }
      }

      await database.updateAgent(userId, {
        customSound: sound.url,
        preferCustomSound: true
      });
      console.log(`✅ Set customSound for agent ${agent.name || userId}`);
    }

    res.json(sound);
  } catch (error) {
    console.error('❌ Error linking agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unlink agent from sound
router.post('/:id/unlink-agent', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    console.log(`🔗 Unlinking agent ${userId} from sound ${req.params.id}`);

    // Step 1: Remove from soundLibrary.json
    const sound = await soundLibrary.unlinkAgent(req.params.id, userId);
    console.log(`✅ Removed from sound linkedAgents`);

    // Step 2: Update agents.json to remove customSound
    // But ONLY if agent actually had this sound as customSound
    const agent = await database.getAgent(userId);
    if (agent && agent.customSound === sound.url) {
      await database.updateAgent(userId, {
        customSound: null,
        preferCustomSound: false
      });
      console.log(`✅ Removed customSound from agent ${agent.name || userId}`);
    }

    res.json(sound);
  } catch (error) {
    console.error('❌ Error unlinking agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sound for specific agent
router.get('/agent/:userId', async (req, res) => {
  try {
    const sound = await soundLibrary.getSoundForAgent(req.params.userId);
    res.json(sound || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CLEANUP UTILITIES ====================

// Test route
router.post('/test-simple', (req, res) => {
  console.log('🧪 TEST ROUTE HIT!');
  res.json({ success: true, message: 'Test works!' });
});

// Cleanup orphaned sound references
router.post('/cleanup', async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of orphaned sound references...');

    const sounds = await soundLibrary.getSounds();
    const agents = await database.getAgents();

    console.log(`📊 Found ${sounds.length} sounds and ${agents.length} agents`);

    let cleanedCount = 0;
    let checkedCount = 0;

    for (const agent of agents) {
      try {
        if (!agent.userId) {
          console.log(`⚠️  Skipping agent without userId`);
          continue;
        }

        const userIdNum = typeof agent.userId === 'string' ? parseInt(agent.userId, 10) : agent.userId;
        checkedCount++;

        const hasActiveSoundLink = sounds.some(sound => {
          if (!sound.linkedAgents || !Array.isArray(sound.linkedAgents)) {
            return false;
          }

          return sound.linkedAgents.some(linkedId => {
            const normalizedLinkedId = typeof linkedId === 'string' ? parseInt(linkedId, 10) : linkedId;
            return normalizedLinkedId === userIdNum;
          });
        });

        if (!hasActiveSoundLink && (agent.customSound || agent.preferCustomSound)) {
          console.log(`🧹 Cleaning orphaned sound reference for agent ${agent.name || userIdNum} (${userIdNum})`);

          await database.updateAgent(userIdNum, {
            customSound: null,
            preferCustomSound: false
          });

          cleanedCount++;
        }
      } catch (agentError) {
        console.error(`❌ Error processing agent ${agent.userId}:`, agentError.message);
        continue;
      }
    }

    console.log(`✅ Cleanup complete! Checked ${checkedCount} agents, cleaned ${cleanedCount} orphaned references`);

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} orphaned sound references`,
      cleanedCount: cleanedCount,
      checkedCount: checkedCount
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
