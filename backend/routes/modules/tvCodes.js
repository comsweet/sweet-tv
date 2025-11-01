// backend/routes/modules/tvCodes.js
// TV Access Codes routes

const express = require('express');
const router = express.Router();
const postgres = require('../../services/postgres');
const { authenticateToken, requireRole } = require('../../middleware/auth');

// Generate random 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==================== TV ACCESS CODES ====================

// POST /api/tv-codes/generate - Generate new TV access code (Admin & Superadmin only)
router.post('/generate', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { expiresInMinutes = 5 } = req.body;

    // Validate expiration time (max 10 minutes)
    if (expiresInMinutes < 1 || expiresInMinutes > 10) {
      return res.status(400).json({ error: 'Expiration must be between 1-10 minutes' });
    }

    // Generate unique code
    let code;
    let attempts = 0;
    while (attempts < 10) {
      code = generateCode();
      const existing = await postgres.getTVAccessCode(code);
      if (!existing) break;
      attempts++;
    }

    if (attempts === 10) {
      return res.status(500).json({ error: 'Failed to generate unique code' });
    }

    const accessCode = await postgres.createTVAccessCode({
      code,
      createdBy: req.user.id,
      createdByEmail: req.user.email,
      expiresInMinutes,
      ipAddress: req.ip
    });

    console.log(`🔑 TV access code generated: ${code} by ${req.user.email} (expires in ${expiresInMinutes}min)`);

    // Log audit
    await postgres.createAuditLog({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'GENERATE_TV_CODE',
      resourceType: 'tv_code',
      resourceId: code,
      details: { expiresInMinutes },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      code: accessCode.code,
      expiresAt: accessCode.expires_at,
      expiresInMinutes
    });
  } catch (error) {
    console.error('Generate TV code error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tv-codes/validate - Validate TV access code (PUBLIC)
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.status(400).json({ valid: false, reason: 'Invalid code format' });
    }

    const result = await postgres.validateTVAccessCode(code, req.ip);

    if (result.valid) {
      console.log(`✅ TV access code validated: ${code} from ${req.ip}`);
    } else {
      console.log(`❌ TV access code validation failed: ${code} - ${result.reason}`);
    }

    res.json(result);
  } catch (error) {
    console.error('Validate TV code error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tv-codes/active - Get active TV access codes (Admin & Superadmin only)
router.get('/active', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const codes = await postgres.getActiveTVAccessCodes();
    res.json({ codes });
  } catch (error) {
    console.error('Get active TV codes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tv-codes/all - Get all TV access codes (Admin & Superadmin only)
router.get('/all', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const codes = await postgres.getAllTVAccessCodes({ limit, offset });
    res.json({ codes });
  } catch (error) {
    console.error('Get all TV codes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/tv-codes/:code - Delete TV access code (Admin & Superadmin only)
router.delete('/:code', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { code } = req.params;
    await postgres.deleteTVAccessCode(code);

    console.log(`🗑️  TV access code deleted: ${code} by ${req.user.email}`);

    // Log audit
    await postgres.createAuditLog({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'DELETE_TV_CODE',
      resourceType: 'tv_code',
      resourceId: code,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete TV code error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tv-codes/cleanup - Delete expired codes (Admin & Superadmin only)
router.post('/cleanup', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const deletedCount = await postgres.deleteExpiredTVAccessCodes();
    console.log(`🧹 Cleaned up ${deletedCount} expired TV access codes`);

    res.json({ deletedCount });
  } catch (error) {
    console.error('Cleanup TV codes error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
