// backend/routes/modules/auth.js
// Authentication routes

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const postgres = require('../../services/postgres');
const { authenticateToken, requireSuperAdmin, JWT_SECRET } = require('../../middleware/auth');

// ==================== PUBLIC ROUTES ====================

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const user = await postgres.getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token (expires in 7 days)
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ User logged in: ${user.email} (${user.role})`);

    // Log audit
    await postgres.createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'LOGIN',
      resourceType: 'auth',
      resourceId: null,
      details: { success: true },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PROTECTED ROUTES ====================

// POST /api/auth/logout (just for audit logging)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await postgres.createAuditLog({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'LOGOUT',
      resourceType: 'auth',
      resourceId: null,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await postgres.getUserById(req.user.id);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Get user
    const user = await postgres.getUserById(req.user.id);

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await postgres.updateUser(user.id, { password_hash: newPasswordHash });

    console.log(`🔒 Password changed for user: ${user.email}`);

    // Log audit
    await postgres.createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'CHANGE_PASSWORD',
      resourceType: 'auth',
      resourceId: user.id.toString(),
      details: { success: true },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== USER MANAGEMENT (SUPERADMIN ONLY) ====================

// GET /api/auth/users - List all users
router.get('/users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const users = await postgres.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/users - Create new user
router.post('/users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role required' });
    }

    if (!['superadmin', 'admin', 'tv-user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await postgres.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await postgres.createUser({
      email,
      passwordHash,
      name,
      role
    });

    console.log(`👤 New user created: ${email} (${role}) by ${req.user.email}`);

    // Log audit
    await postgres.createAuditLog({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'CREATE_USER',
      resourceType: 'user',
      resourceId: newUser.id.toString(),
      details: { email, name, role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        active: newUser.active
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/users/:id - Update user
router.put('/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, role, active } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) {
      if (!['superadmin', 'admin', 'tv-user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.role = role;
    }
    if (active !== undefined) updates.active = active;

    const updatedUser = await postgres.updateUser(userId, updates);

    console.log(`👤 User updated: ${updatedUser.email} by ${req.user.email}`);

    // Log audit
    await postgres.createAuditLog({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'UPDATE_USER',
      resourceType: 'user',
      resourceId: userId.toString(),
      details: updates,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        active: updatedUser.active
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/users/:id - Delete user
router.delete('/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = await postgres.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await postgres.deleteUser(userId);

    console.log(`👤 User deleted: ${user.email} by ${req.user.email}`);

    // Log audit
    await postgres.createAuditLog({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'DELETE_USER',
      resourceType: 'user',
      resourceId: userId.toString(),
      details: { email: user.email, name: user.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
