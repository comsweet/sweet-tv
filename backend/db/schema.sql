-- Sweet TV Database Schema
-- Run this to initialize your Postgres database

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'admin', 'tv-user')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agents table (migrated from JSON file)
CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  profile_image VARCHAR(500),
  group_id INTEGER,
  group_name VARCHAR(255),
  custom_sound VARCHAR(500),
  prefer_custom_sound BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API rate monitoring
CREATE TABLE IF NOT EXISTS api_requests (
  id SERIAL PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time INTEGER,
  user_id INTEGER REFERENCES users(id),
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TV Access Codes (for TV slideshow access without user accounts)
CREATE TABLE IF NOT EXISTS tv_access_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_by_email VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_api_requests_endpoint ON api_requests(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_requests_created_at ON api_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_tv_access_codes_code ON tv_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_tv_access_codes_expires_at ON tv_access_codes(expires_at);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== SMS & DEALS CACHE TABLES ====================

-- SMS Messages table (migrated from sms-cache.json)
CREATE TABLE IF NOT EXISTS sms_messages (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER NOT NULL,
  receiver VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  campaign_id VARCHAR(255),
  lead_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'delivered',
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for SMS queries
CREATE INDEX IF NOT EXISTS idx_sms_user_timestamp ON sms_messages(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sms_date ON sms_messages(DATE(timestamp));
CREATE INDEX IF NOT EXISTS idx_sms_receiver_date ON sms_messages(receiver, DATE(timestamp));
CREATE INDEX IF NOT EXISTS idx_sms_lead_id ON sms_messages(lead_id);

-- Deals table (migrated from deals-cache.json)
CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY,
  lead_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  campaign_id VARCHAR(255),
  commission DECIMAL(10,2),
  multi_deals INTEGER DEFAULT 1,
  order_date TIMESTAMP NOT NULL,
  status VARCHAR(50),
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Duplicate tracking
  is_duplicate BOOLEAN DEFAULT FALSE,
  replaced_by INTEGER REFERENCES deals(id)
);

-- Indexes for deal queries
CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_user_order_date ON deals(user_id, order_date);
CREATE INDEX IF NOT EXISTS idx_deals_date ON deals(DATE(order_date));
CREATE INDEX IF NOT EXISTS idx_deals_campaign ON deals(campaign_id);

-- NOTE: No UNIQUE constraint on lead_id + date
-- Duplicate detection handled in application layer (dealsCache.js)
-- This allows admin to approve multiple deals for same lead on same day if legitimate

-- Pending duplicates table (for manual resolution)
CREATE TABLE IF NOT EXISTS pending_duplicates (
  id SERIAL PRIMARY KEY,
  lead_id VARCHAR(255) NOT NULL,

  -- New deal data waiting for approval
  new_user_id INTEGER,
  new_commission DECIMAL(10,2),
  new_order_date TIMESTAMP,
  new_campaign_id VARCHAR(255),
  new_multi_deals INTEGER,
  new_status VARCHAR(50),
  new_data JSONB,  -- Full deal data as JSON

  -- Reference to existing deal
  existing_deal_id INTEGER REFERENCES deals(id),

  -- Resolution metadata
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(255),  -- Admin email/name
  resolution VARCHAR(50),    -- 'approved', 'replaced', 'rejected', 'merged'
  resolution_note TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'pending'  -- 'pending', 'resolved'
);

-- Indexes for pending duplicates
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_duplicates(status);
CREATE INDEX IF NOT EXISTS idx_pending_lead_id ON pending_duplicates(lead_id);
CREATE INDEX IF NOT EXISTS idx_pending_detected_at ON pending_duplicates(detected_at);

-- Campaigns table (migrated from campaign-cache.json)
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255),
  group_name VARCHAR(255),
  fetched_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_group ON campaigns(group_name);

-- Apply trigger to campaigns table
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
