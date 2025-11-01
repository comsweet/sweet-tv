// backend/routes/modules/monitoring.js
// Monitoring routes for audit logs and API statistics

const express = require('express');
const router = express.Router();
const postgres = require('../../services/postgres');
const { authenticateToken, requireRole } = require('../../middleware/auth');

// ==================== AUDIT LOGS (Admin & Superadmin only) ====================

// GET /api/monitoring/audit-logs
router.get('/audit-logs', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const {
      limit = 100,
      offset = 0,
      userId,
      resourceType,
      startDate,
      endDate
    } = req.query;

    const logs = await postgres.getAuditLogs({
      limit: parseInt(limit),
      offset: parseInt(offset),
      userId: userId ? parseInt(userId) : undefined,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    const totalCount = await postgres.getAuditLogsCount({
      userId: userId ? parseInt(userId) : undefined,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    res.json({
      logs,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API STATISTICS (Admin & Superadmin only) ====================

// GET /api/monitoring/api-stats
router.get('/api-stats', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      endpoint
    } = req.query;

    // Default to last 24 hours if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const stats = await postgres.getApiStats({
      startDate: start,
      endDate: end,
      endpoint
    });

    res.json({
      stats,
      period: {
        startDate: start,
        endDate: end
      }
    });
  } catch (error) {
    console.error('Get API stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/monitoring/api-stats/summary
router.get('/api-stats/summary', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    // Get stats for multiple time periods
    const now = new Date();

    // Last hour
    const lastHourStart = new Date(now.getTime() - 60 * 60 * 1000);
    const lastHourStats = await postgres.getApiStats({
      startDate: lastHourStart,
      endDate: now
    });

    // Last 24 hours
    const last24HoursStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last24HoursStats = await postgres.getApiStats({
      startDate: last24HoursStart,
      endDate: now
    });

    // Calculate totals
    const calculateTotals = (stats) => {
      return stats.reduce((acc, stat) => {
        acc.totalRequests += parseInt(stat.request_count);
        acc.totalErrors += parseInt(stat.error_count);
        acc.avgResponseTime += parseFloat(stat.avg_response_time) * parseInt(stat.request_count);
        return acc;
      }, { totalRequests: 0, totalErrors: 0, avgResponseTime: 0 });
    };

    const lastHourTotals = calculateTotals(lastHourStats);
    const last24HoursTotals = calculateTotals(last24HoursStats);

    res.json({
      lastHour: {
        totalRequests: lastHourTotals.totalRequests,
        totalErrors: lastHourTotals.totalErrors,
        avgResponseTime: lastHourTotals.totalRequests > 0
          ? lastHourTotals.avgResponseTime / lastHourTotals.totalRequests
          : 0,
        errorRate: lastHourTotals.totalRequests > 0
          ? (lastHourTotals.totalErrors / lastHourTotals.totalRequests * 100)
          : 0,
        // Adversus rate limit: 60 requests per minute
        utilizationPercent: (lastHourTotals.totalRequests / (60 * 60)) * 100
      },
      last24Hours: {
        totalRequests: last24HoursTotals.totalRequests,
        totalErrors: last24HoursTotals.totalErrors,
        avgResponseTime: last24HoursTotals.totalRequests > 0
          ? last24HoursTotals.avgResponseTime / last24HoursTotals.totalRequests
          : 0,
        errorRate: last24HoursTotals.totalRequests > 0
          ? (last24HoursTotals.totalErrors / last24HoursTotals.totalRequests * 100)
          : 0,
        // Adversus rate limit: 1000 requests per hour
        utilizationPercent: (last24HoursTotals.totalRequests / 1000) * 100
      }
    });
  } catch (error) {
    console.error('Get API stats summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
