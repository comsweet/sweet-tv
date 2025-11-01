// backend/services/postgres.js
// Postgres database service using pg Pool

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class PostgresService {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      // Create connection pool
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? {
          rejectUnauthorized: false
        } : false,
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const client = await this.pool.connect();
      console.log('✅ PostgreSQL connected successfully');
      client.release();

      // Initialize schema
      await this.initSchema();

      this.initialized = true;
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      throw error;
    }
  }

  async initSchema() {
    try {
      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const schemaSql = await fs.readFile(schemaPath, 'utf8');

      await this.pool.query(schemaSql);
      console.log('✅ Database schema initialized');
    } catch (error) {
      // Schema errors are OK if tables already exist
      if (error.code === '42P07' || error.code === '42710') {
        console.log('⚠️  Schema already exists (this is OK)');
      } else {
        console.error('❌ Schema initialization failed:', error.message);
        throw error;
      }
    }
  }

  async query(text, params) {
    if (!this.initialized) {
      await this.init();
    }

    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        console.warn(`⚠️  Slow query (${duration}ms): ${text.substring(0, 100)}`);
      }

      return res;
    } catch (error) {
      console.error('❌ Query error:', error.message);
      console.error('Query:', text);
      throw error;
    }
  }

  async getClient() {
    if (!this.initialized) {
      await this.init();
    }
    return this.pool.connect();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 PostgreSQL connection closed');
    }
  }

  // ==================== USERS ====================

  async createUser({ email, passwordHash, name, role = 'admin' }) {
    const result = await this.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, passwordHash, name, role]
    );
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const result = await this.query(
      'SELECT * FROM users WHERE email = $1 AND active = true',
      [email]
    );
    return result.rows[0];
  }

  async getUserById(id) {
    const result = await this.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  async getAllUsers() {
    const result = await this.query(
      'SELECT id, email, name, role, active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async updateUser(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    values.push(id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async deleteUser(id) {
    await this.query('DELETE FROM users WHERE id = $1', [id]);
  }

  // ==================== AGENTS ====================

  async createAgent({ userId, name, email, profileImage, groupId, groupName, customSound, preferCustomSound }) {
    const result = await this.query(
      'INSERT INTO agents (user_id, name, email, profile_image, group_id, group_name, custom_sound, prefer_custom_sound) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id) DO UPDATE SET name = $2, email = $3, group_id = $5, group_name = $6 RETURNING *',
      [userId, name, email, profileImage, groupId, groupName, customSound, preferCustomSound]
    );
    return result.rows[0];
  }

  async getAgents() {
    const result = await this.query(
      'SELECT * FROM agents ORDER BY name ASC'
    );
    return result.rows;
  }

  async getAgent(userId) {
    const result = await this.query(
      'SELECT * FROM agents WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async updateAgent(userId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'userId' && key !== 'user_id') {
        const dbKey = key === 'profileImage' ? 'profile_image' :
                      key === 'groupId' ? 'group_id' :
                      key === 'groupName' ? 'group_name' :
                      key === 'customSound' ? 'custom_sound' :
                      key === 'preferCustomSound' ? 'prefer_custom_sound' : key;
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    values.push(userId);
    const query = `UPDATE agents SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async deleteAgent(userId) {
    await this.query('DELETE FROM agents WHERE user_id = $1', [userId]);
  }

  // ==================== AUDIT LOGS ====================

  async createAuditLog({ userId, userEmail, action, resourceType, resourceId, details, ipAddress, userAgent }) {
    const result = await this.query(
      'INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, details, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [userId, userEmail, action, resourceType, resourceId, JSON.stringify(details), ipAddress, userAgent]
    );
    return result.rows[0];
  }

  async getAuditLogs({ limit = 100, offset = 0, userId, resourceType, startDate, endDate }) {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (userId) {
      query += ` AND user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    if (resourceType) {
      query += ` AND resource_type = $${paramCount}`;
      params.push(resourceType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await this.query(query, params);
    return result.rows;
  }

  async getAuditLogsCount({ userId, resourceType, startDate, endDate }) {
    let query = 'SELECT COUNT(*) FROM audit_logs WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (userId) {
      query += ` AND user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    if (resourceType) {
      query += ` AND resource_type = $${paramCount}`;
      params.push(resourceType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    const result = await this.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async deleteOldAuditLogs(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.query(
      'DELETE FROM audit_logs WHERE created_at < $1',
      [cutoffDate]
    );

    return result.rowCount;
  }

  // ==================== API REQUESTS ====================

  async logApiRequest({ endpoint, method, statusCode, responseTime, userId, ipAddress }) {
    await this.query(
      'INSERT INTO api_requests (endpoint, method, status_code, response_time, user_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [endpoint, method, statusCode, responseTime, userId, ipAddress]
    );
  }

  async getApiStats({ startDate, endDate, endpoint }) {
    let query = `
      SELECT
        endpoint,
        method,
        COUNT(*) as request_count,
        AVG(response_time) as avg_response_time,
        MAX(response_time) as max_response_time,
        MIN(response_time) as min_response_time,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM api_requests
      WHERE created_at >= $1 AND created_at <= $2
    `;
    const params = [startDate, endDate];

    if (endpoint) {
      query += ' AND endpoint = $3';
      params.push(endpoint);
    }

    query += ' GROUP BY endpoint, method ORDER BY request_count DESC';

    const result = await this.query(query, params);
    return result.rows;
  }

  async deleteOldApiRequests(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.query(
      'DELETE FROM api_requests WHERE created_at < $1',
      [cutoffDate]
    );

    return result.rowCount;
  }

  // ==================== TV ACCESS CODES ====================

  async createTVAccessCode({ code, createdBy, createdByEmail, expiresInMinutes = 5, ipAddress }) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    const result = await this.query(
      'INSERT INTO tv_access_codes (code, created_by, created_by_email, expires_at, ip_address) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [code, createdBy, createdByEmail, expiresAt, ipAddress]
    );

    return result.rows[0];
  }

  async getTVAccessCode(code) {
    const result = await this.query(
      'SELECT * FROM tv_access_codes WHERE code = $1',
      [code]
    );

    return result.rows[0];
  }

  async validateTVAccessCode(code, ipAddress) {
    const accessCode = await this.getTVAccessCode(code);

    if (!accessCode) {
      return { valid: false, reason: 'Code not found' };
    }

    if (accessCode.used) {
      return { valid: false, reason: 'Code already used' };
    }

    if (new Date(accessCode.expires_at) < new Date()) {
      return { valid: false, reason: 'Code expired' };
    }

    // Mark as used
    await this.query(
      'UPDATE tv_access_codes SET used = true, used_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE code = $2',
      [ipAddress, code]
    );

    return { valid: true, accessCode };
  }

  async getActiveTVAccessCodes() {
    const result = await this.query(
      'SELECT * FROM tv_access_codes WHERE used = false AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC',
      []
    );

    return result.rows;
  }

  async getAllTVAccessCodes({ limit = 100, offset = 0 }) {
    const result = await this.query(
      'SELECT * FROM tv_access_codes ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return result.rows;
  }

  async deleteExpiredTVAccessCodes() {
    const result = await this.query(
      'DELETE FROM tv_access_codes WHERE expires_at < CURRENT_TIMESTAMP',
      []
    );

    return result.rowCount;
  }

  async deleteTVAccessCode(code) {
    await this.query('DELETE FROM tv_access_codes WHERE code = $1', [code]);
  }
}

// Create singleton instance
const postgresService = new PostgresService();

module.exports = postgresService;
