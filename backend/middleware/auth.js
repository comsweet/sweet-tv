// backend/middleware/auth.js
// JWT Authentication middleware

const jwt = require('jsonwebtoken');
const postgres = require('../services/postgres');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = await postgres.getUserById(decoded.userId);

    if (!user || !user.active) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Check if user has required role
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Role constants
const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  TV_USER: 'tv-user'
};

// Optional authentication - tries to authenticate but doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      // No token, continue without user
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = await postgres.getUserById(decoded.userId);

    if (user && user.active) {
      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      };
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without user
    next();
  }
};

// Middleware presets
const requireSuperAdmin = requireRole([ROLES.SUPERADMIN]);
const requireAdmin = requireRole([ROLES.SUPERADMIN, ROLES.ADMIN]);
const requireAnyAuth = requireRole([ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.TV_USER]);

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requireAnyAuth,
  ROLES,
  JWT_SECRET
};
