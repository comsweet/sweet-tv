// backend/services/postgres.js
// Postgres database service using pg Pool

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class PostgresService {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.initPromise = null; // Track ongoing initialization
  }

  async init() {
    // If already initialized, return immediately
    if (this.initialized) return;

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start new initialization
    this.initPromise = this._doInit();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async _doInit() {
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

    // Run migrations after schema initialization
    try {
      const { runMigrations } = require('../db/migrations/auto-migrate');
      await runMigrations();
    } catch (error) {
      console.error('⚠️  Migration script error:', error.message);
      // Don't throw - allow server to continue
    }

    try {
      // Update statistics for query planner (run regardless of schema creation)
      await this.pool.query('VACUUM ANALYZE sms_messages');
      console.log('✅ Updated query planner statistics');

      // List all indexes on sms_messages table
      const indexes = await this.pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'sms_messages'
        ORDER BY indexname
      `);
      console.log('📊 SMS indexes:');
      indexes.rows.forEach(idx => {
        console.log(`   ${idx.indexname}: ${idx.indexdef}`);
      });

      // Run EXPLAIN on the optimized COUNT query
      const explain = await this.pool.query(`
        EXPLAIN SELECT COUNT(DISTINCT CONCAT(receiver, '|', DATE(timestamp))) as count
        FROM sms_messages
        WHERE user_id = 222478 AND timestamp >= '2025-10-27T00:00:00.000Z' AND timestamp <= '2025-11-02T23:59:59.999Z'
      `);
      console.log('🔍 Query plan for getUniqueSMSCountForUser (optimized SQL COUNT):');
      explain.rows.forEach(row => console.log('   ', row['QUERY PLAN']));
    } catch (error) {
      console.error('⚠️  Could not list indexes:', error.message);
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

  // ==================== TV SESSIONS ====================

  async createTVSession({ sessionId, accessCodeId, accessCode, ipAddress, userAgent }) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12); // 12-hour timeout

    const result = await this.query(
      `INSERT INTO tv_sessions (session_id, access_code_id, access_code, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sessionId, accessCodeId, accessCode, ipAddress, userAgent, expiresAt]
    );

    return result.rows[0];
  }

  async getTVSession(sessionId) {
    const result = await this.query(
      'SELECT * FROM tv_sessions WHERE session_id = $1',
      [sessionId]
    );

    return result.rows[0];
  }

  async validateTVSession(sessionId) {
    const session = await this.getTVSession(sessionId);

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (!session.active) {
      return { valid: false, reason: 'Session terminated', terminatedReason: session.terminated_reason };
    }

    if (new Date(session.expires_at) < new Date()) {
      // Auto-terminate expired session
      await this.terminateTVSession(sessionId, null, 'Session expired after 12 hours');
      return { valid: false, reason: 'Session expired' };
    }

    return { valid: true, session };
  }

  async updateTVSessionActivity(sessionId) {
    const result = await this.query(
      'UPDATE tv_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE session_id = $1 AND active = true RETURNING *',
      [sessionId]
    );

    return result.rows[0];
  }

  async getActiveTVSessions() {
    const result = await this.query(
      `SELECT
        ts.*,
        tac.created_by_email,
        EXTRACT(EPOCH FROM (ts.expires_at - CURRENT_TIMESTAMP))/3600 as hours_remaining,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ts.last_activity_at))/60 as minutes_since_activity
       FROM tv_sessions ts
       LEFT JOIN tv_access_codes tac ON ts.access_code_id = tac.id
       WHERE ts.active = true AND ts.expires_at > CURRENT_TIMESTAMP
       ORDER BY ts.started_at DESC`,
      []
    );

    return result.rows;
  }

  async terminateTVSession(sessionId, terminatedBy = null, reason = 'Manually terminated') {
    const result = await this.query(
      `UPDATE tv_sessions
       SET active = false, terminated_at = CURRENT_TIMESTAMP, terminated_by = $2, terminated_reason = $3
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, terminatedBy, reason]
    );

    return result.rows[0];
  }

  async cleanupExpiredTVSessions() {
    const result = await this.query(
      `UPDATE tv_sessions
       SET active = false, terminated_at = CURRENT_TIMESTAMP, terminated_reason = 'Session expired after 12 hours'
       WHERE active = true AND expires_at < CURRENT_TIMESTAMP
       RETURNING *`
    );

    return result.rowCount;
  }

  async getAllTVSessions({ limit = 100, offset = 0 }) {
    const result = await this.query(
      `SELECT
        ts.*,
        tac.created_by_email,
        EXTRACT(EPOCH FROM (ts.expires_at - ts.started_at))/3600 as session_duration_hours,
        EXTRACT(EPOCH FROM (COALESCE(ts.terminated_at, CURRENT_TIMESTAMP) - ts.started_at))/3600 as actual_duration_hours
       FROM tv_sessions ts
       LEFT JOIN tv_access_codes tac ON ts.access_code_id = tac.id
       ORDER BY ts.started_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  // ==================== DEALS ====================

  async insertDeal({ leadId, userId, campaignId, commission, multiDeals, orderDate, status }) {
    // NOTE: No unique constraint on lead_id in database
    // Duplicate detection handled in application layer (dealsCache.js)
    const result = await this.query(
      `INSERT INTO deals (lead_id, user_id, campaign_id, commission, multi_deals, order_date, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [leadId, userId, campaignId, commission, multiDeals || 1, orderDate, status]
    );
    return result.rows[0];
  }

  async batchInsertDeals(deals) {
    if (deals.length === 0) return;

    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      // Use ON CONFLICT with UNIQUE constraint on lead_id
      // If lead_id exists, update the existing row
      // This enforces: same lead_id can only exist ONCE
      for (const deal of deals) {
        await client.query(
          `INSERT INTO deals (lead_id, user_id, campaign_id, commission, multi_deals, order_date, status, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (lead_id) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             campaign_id = EXCLUDED.campaign_id,
             commission = EXCLUDED.commission,
             multi_deals = EXCLUDED.multi_deals,
             order_date = EXCLUDED.order_date,
             status = EXCLUDED.status,
             synced_at = NOW()`,
          [deal.leadId, deal.userId, deal.campaignId, deal.commission, deal.multiDeals || 1, deal.orderDate, deal.status]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Batch upserted ${deals.length} deals`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Batch insert failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getDealsInRange(startDate, endDate) {
    const result = await this.query(
      `SELECT * FROM deals
       WHERE order_date >= $1 AND order_date <= $2
       AND (replaced_by IS NULL OR is_duplicate = FALSE)`,
      [startDate, endDate]
    );
    return result.rows;
  }

  async getDealsForUser(userId, startDate, endDate) {
    const result = await this.query(
      `SELECT * FROM deals
       WHERE user_id = $1 AND order_date >= $2 AND order_date <= $3
       AND (replaced_by IS NULL OR is_duplicate = FALSE)
       ORDER BY order_date DESC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  }

  async getDealByLeadId(leadId) {
    const result = await this.query(
      'SELECT * FROM deals WHERE lead_id = $1 AND (replaced_by IS NULL OR is_duplicate = FALSE)',
      [leadId]
    );
    return result.rows;
  }

  async updateDeal(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        const dbKey = key === 'leadId' ? 'lead_id' :
                      key === 'userId' ? 'user_id' :
                      key === 'campaignId' ? 'campaign_id' :
                      key === 'multiDeals' ? 'multi_deals' :
                      key === 'orderDate' ? 'order_date' : key;
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    values.push(id);
    const query = `UPDATE deals SET ${fields.join(', ')}, synced_at = NOW() WHERE id = $${paramCount} RETURNING *`;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async deleteDealsInRange(startDate, endDate) {
    const result = await this.query(
      'DELETE FROM deals WHERE order_date >= $1 AND order_date <= $2',
      [startDate, endDate]
    );
    return result.rowCount;
  }

  async deleteDealsNotInList(startDate, endDate, leadIds) {
    if (leadIds.length === 0) {
      // Delete all in range if no leads provided
      return this.deleteDealsInRange(startDate, endDate);
    }

    const placeholders = leadIds.map((_, i) => `$${i + 3}`).join(',');
    const result = await this.query(
      `DELETE FROM deals
       WHERE order_date >= $1 AND order_date <= $2
       AND lead_id NOT IN (${placeholders})`,
      [startDate, endDate, ...leadIds]
    );
    return result.rowCount;
  }

  // ==================== SMS MESSAGES ====================

  async insertSMS({ id, userId, receiver, timestamp, campaignId, leadId, status }) {
    const result = await this.query(
      `INSERT INTO sms_messages (id, user_id, receiver, timestamp, campaign_id, lead_id, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         synced_at = NOW()
       RETURNING *`,
      [id, userId, receiver, timestamp, campaignId, leadId, status]
    );
    return result.rows[0];
  }

  async batchInsertSMS(smsMessages) {
    if (smsMessages.length === 0) return;

    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      for (const sms of smsMessages) {
        await client.query(
          `INSERT INTO sms_messages (id, user_id, receiver, timestamp, campaign_id, lead_id, status, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             synced_at = NOW()`,
          [sms.id, sms.userId, sms.receiver, sms.timestamp, sms.campaignId, sms.leadId, sms.status]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Batch inserted ${smsMessages.length} SMS messages`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Batch SMS insert failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getSMSInRange(startDate, endDate) {
    const result = await this.query(
      `SELECT * FROM sms_messages
       WHERE timestamp >= $1 AND timestamp <= $2`,
      [startDate, endDate]
    );
    return result.rows;
  }

  async getSMSForUser(userId, startDate, endDate) {
    const result = await this.query(
      `SELECT * FROM sms_messages
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [userId, startDate, endDate]
    );
    return result.rows;
  }

  async getUniqueSMSCountForUser(userId, startDate, endDate) {
    const result = await this.query(
      `SELECT COUNT(DISTINCT CONCAT(receiver, '|', DATE(timestamp))) as count
       FROM sms_messages
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [userId, startDate, endDate]
    );
    return parseInt(result.rows[0].count);
  }

  async deleteSMSInRange(startDate, endDate) {
    const result = await this.query(
      'DELETE FROM sms_messages WHERE timestamp >= $1 AND timestamp <= $2',
      [startDate, endDate]
    );
    return result.rowCount;
  }

  async deleteSMSNotInList(startDate, endDate, smsIds) {
    if (smsIds.length === 0) {
      return this.deleteSMSInRange(startDate, endDate);
    }

    const placeholders = smsIds.map((_, i) => `$${i + 3}`).join(',');
    const result = await this.query(
      `DELETE FROM sms_messages
       WHERE timestamp >= $1 AND timestamp <= $2
       AND id NOT IN (${placeholders})`,
      [startDate, endDate, ...smsIds]
    );
    return result.rowCount;
  }

  // ==================== PENDING DUPLICATES ====================

  async createPendingDuplicate({ leadId, newDealData, existingDealId }) {
    const result = await this.query(
      `INSERT INTO pending_duplicates (
        lead_id, new_user_id, new_commission, new_order_date,
        new_campaign_id, new_multi_deals, new_status, new_data, existing_deal_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        leadId,
        newDealData.userId,
        newDealData.commission,
        newDealData.orderDate,
        newDealData.campaignId,
        newDealData.multiDeals,
        newDealData.status,
        JSON.stringify(newDealData),
        existingDealId
      ]
    );
    return result.rows[0];
  }

  async getPendingDuplicates() {
    const result = await this.query(
      `SELECT
        pd.*,
        d.commission as existing_commission,
        d.order_date as existing_order_date,
        d.user_id as existing_user_id,
        d.campaign_id as existing_campaign_id,
        a1.name as existing_agent_name,
        a2.name as new_agent_name
       FROM pending_duplicates pd
       LEFT JOIN deals d ON pd.existing_deal_id = d.id
       LEFT JOIN agents a1 ON d.user_id = a1.user_id
       LEFT JOIN agents a2 ON pd.new_user_id = a2.user_id
       WHERE pd.status = 'pending'
       ORDER BY pd.detected_at DESC`
    );
    return result.rows;
  }

  async getPendingDuplicate(id) {
    const result = await this.query(
      'SELECT * FROM pending_duplicates WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  async resolvePendingDuplicate(id, resolution, resolvedBy, note) {
    const result = await this.query(
      `UPDATE pending_duplicates
       SET status = 'resolved',
           resolved_at = NOW(),
           resolved_by = $2,
           resolution = $3,
           resolution_note = $4
       WHERE id = $1
       RETURNING *`,
      [id, resolvedBy, resolution, note]
    );
    return result.rows[0];
  }

  async getDuplicateHistory(limit = 100) {
    const result = await this.query(
      `SELECT * FROM pending_duplicates
       WHERE status = 'resolved'
       ORDER BY resolved_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // ==================== CAMPAIGNS ====================

  async upsertCampaign({ campaignId, name, groupName }) {
    const result = await this.query(
      `INSERT INTO campaigns (campaign_id, name, group_name, fetched_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (campaign_id) DO UPDATE SET
         name = EXCLUDED.name,
         group_name = EXCLUDED.group_name,
         fetched_at = NOW()
       RETURNING *`,
      [campaignId, name, groupName]
    );
    return result.rows[0];
  }

  async getCampaign(campaignId) {
    const result = await this.query(
      'SELECT * FROM campaigns WHERE campaign_id = $1',
      [campaignId]
    );
    return result.rows[0];
  }

  async getAllCampaigns() {
    const result = await this.query(
      'SELECT * FROM campaigns ORDER BY name ASC'
    );
    return result.rows;
  }

  // ==================== QUOTES ====================

  async createQuote({ quote, attribution, active = true }) {
    const result = await this.query(
      'INSERT INTO quotes (quote, attribution, active) VALUES ($1, $2, $3) RETURNING *',
      [quote, attribution, active]
    );
    return result.rows[0];
  }

  async batchInsertQuotes(quotes) {
    if (quotes.length === 0) return;

    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      for (const quote of quotes) {
        await client.query(
          'INSERT INTO quotes (quote, attribution, active) VALUES ($1, $2, $3)',
          [quote.quote, quote.attribution, quote.active !== undefined ? quote.active : true]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Batch inserted ${quotes.length} quotes`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Batch quote insert failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllQuotes() {
    const result = await this.query(
      'SELECT id, quote, attribution, active, COALESCE(times_shown, 0) as times_shown, created_at, updated_at FROM quotes ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async getActiveQuotes() {
    const result = await this.query(
      'SELECT id, quote, attribution, active, COALESCE(times_shown, 0) as times_shown, created_at, updated_at FROM quotes WHERE active = true ORDER BY times_shown ASC, RANDOM()'
    );
    return result.rows;
  }

  async getQuote(id) {
    const result = await this.query(
      'SELECT id, quote, attribution, active, COALESCE(times_shown, 0) as times_shown, created_at, updated_at FROM quotes WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  async updateQuote(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        const dbKey = key === 'timesShown' ? 'times_shown' : key;
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    values.push(id);
    const query = `UPDATE quotes SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async incrementQuoteTimesShown(id) {
    const result = await this.query(
      'UPDATE quotes SET times_shown = times_shown + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  async deleteQuote(id) {
    await this.query('DELETE FROM quotes WHERE id = $1', [id]);
  }

  async getQuotesCount() {
    const result = await this.query('SELECT COUNT(*) FROM quotes');
    return parseInt(result.rows[0].count);
  }
}

// Create singleton instance
const postgresService = new PostgresService();

module.exports = postgresService;
