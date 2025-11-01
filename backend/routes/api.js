const express = require('express');
const router = express.Router();

// ==================== MODULAR ROUTES ====================
// All endpoints are now organized in separate modules for better maintainability

const authRouter = require('./modules/auth');
const agentsRouter = require('./modules/agents');
const leaderboardsRouter = require('./modules/leaderboards');
const slideshowsRouter = require('./modules/slideshows');
const campaignBonusTiersRouter = require('./modules/campaignBonusTiers');
const dealsRouter = require('./modules/deals');
const soundsRouter = require('./modules/sounds');
const statsRouter = require('./modules/stats');
const notificationsRouter = require('./modules/notifications');
const smsRouter = require('./modules/sms');
const autoRefreshRouter = require('./modules/autoRefresh');
const thresholdsRouter = require('./modules/thresholds');
const monitoringRouter = require('./modules/monitoring');
const tvCodesRouter = require('./modules/tvCodes');

// Mount all modular routes
router.use('/auth', authRouter);
router.use('/agents', agentsRouter);
router.use('/leaderboards', leaderboardsRouter);
router.use('/slideshows', slideshowsRouter);
router.use('/campaign-bonus-tiers', campaignBonusTiersRouter);
router.use('/deals', dealsRouter);
router.use('/sounds', soundsRouter);
router.use('/stats', statsRouter);
router.use('/notification-settings', notificationsRouter);
router.use('/sms', smsRouter);
router.use('/auto-refresh', autoRefreshRouter);
router.use('/thresholds', thresholdsRouter);
router.use('/monitoring', monitoringRouter);
router.use('/tv-codes', tvCodesRouter);

// ==================== CORE ENDPOINTS ====================

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Sweet TV API is running'
  });
});

// DEPRECATED: Old admin authentication (kept for backward compatibility)
// Use /api/auth/login instead
router.post('/auth/admin-login', (req, res) => {
  try {
    const { password } = req.body;

    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured on server. Please use /api/auth/login with email and password instead.'
      });
    }

    if (password === process.env.ADMIN_PASSWORD) {
      console.log('⚠️  Legacy admin login used - please migrate to /api/auth/login');
      res.json({
        success: true,
        message: 'Authentication successful (legacy method)'
      });
    } else {
      console.log('❌ Admin login failed - invalid password');
      res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== MODULE EXPORTS ====================

module.exports = router;
