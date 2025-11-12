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

-- TV Sessions (tracks active slideshow sessions with 12-hour timeout)
CREATE TABLE IF NOT EXISTS tv_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(36) UNIQUE NOT NULL,
  access_code_id INTEGER REFERENCES tv_access_codes(id),
  access_code VARCHAR(6),
  ip_address VARCHAR(45),
  user_agent TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true,
  terminated_by INTEGER REFERENCES users(id),
  terminated_at TIMESTAMP,
  terminated_reason TEXT,
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
CREATE INDEX IF NOT EXISTS idx_tv_sessions_session_id ON tv_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_tv_sessions_active ON tv_sessions(active);
CREATE INDEX IF NOT EXISTS idx_tv_sessions_expires_at ON tv_sessions(expires_at);

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
CREATE INDEX IF NOT EXISTS idx_sms_timestamp ON sms_messages(timestamp);  -- For range queries
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
CREATE INDEX IF NOT EXISTS idx_deals_order_date ON deals(order_date);  -- For range queries
CREATE INDEX IF NOT EXISTS idx_deals_user_order_date ON deals(user_id, order_date);
CREATE INDEX IF NOT EXISTS idx_deals_date ON deals(DATE(order_date));
CREATE INDEX IF NOT EXISTS idx_deals_campaign ON deals(campaign_id);

-- UNIQUE constraint: Same lead_id can only exist ONCE
-- If duplicate detected, it goes to pending_duplicates for admin review
-- Admin decides: keep old, replace with new, or reject new
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_unique_lead_id ON deals(lead_id);

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

-- ==================== QUOTES LIBRARY ====================

-- Quotes table (motivational quotes for sales team)
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  quote TEXT NOT NULL,
  attribution VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  times_shown INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for quotes
CREATE INDEX IF NOT EXISTS idx_quotes_active ON quotes(active);
CREATE INDEX IF NOT EXISTS idx_quotes_times_shown ON quotes(times_shown);

-- Apply trigger to quotes table
DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== LOGIN TIME TRACKING ====================

-- User login time table (tracks login seconds for deals per hour calculation)
CREATE TABLE IF NOT EXISTS user_login_time (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  login_seconds INTEGER NOT NULL,
  from_date TIMESTAMP NOT NULL,
  to_date TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure one entry per user per date range
  UNIQUE(user_id, from_date, to_date)
);

-- Indexes for login time queries
CREATE INDEX IF NOT EXISTS idx_login_time_user_id ON user_login_time(user_id);
CREATE INDEX IF NOT EXISTS idx_login_time_date_range ON user_login_time(from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_login_time_synced_at ON user_login_time(synced_at);

-- ==================== LEADERBOARDS ====================

-- Leaderboards table (configuration for different leaderboard displays)
CREATE TABLE IF NOT EXISTS leaderboards (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'standard' CHECK (type IN ('standard', 'metrics-grid')),
  user_groups JSONB DEFAULT '[]',
  time_period VARCHAR(50) DEFAULT 'month' CHECK (time_period IN ('day', 'week', 'month', 'custom')),
  custom_start_date TIMESTAMP,
  custom_end_date TIMESTAMP,
  visible_columns JSONB DEFAULT '{"dealsPerHour": true, "deals": true, "sms": true, "commission": true, "campaignBonus": true, "total": true}',
  column_order JSONB DEFAULT '["dealsPerHour", "deals", "sms", "commission", "campaignBonus", "total"]',
  sort_by VARCHAR(50) DEFAULT 'commission',
  brand_logo VARCHAR(500),
  company_logo VARCHAR(500),
  display_mode VARCHAR(50) DEFAULT 'individual' CHECK (display_mode IN ('individual', 'groups')),
  top_n INTEGER,
  visualization_mode VARCHAR(50) DEFAULT 'table' CHECK (visualization_mode IN ('table', 'cards', 'progress', 'rocket', 'race')),
  show_graphs BOOLEAN DEFAULT false,
  show_gap BOOLEAN DEFAULT true,
  show_mini_stats BOOLEAN DEFAULT false,
  goal_value DECIMAL(10, 2),
  goal_label VARCHAR(255),
  enable_auto_scroll BOOLEAN DEFAULT true,
  selected_groups JSONB DEFAULT '[]',
  metrics JSONB DEFAULT '[]',
  color_rules JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for leaderboards
CREATE INDEX IF NOT EXISTS idx_leaderboards_active ON leaderboards(active);
CREATE INDEX IF NOT EXISTS idx_leaderboards_type ON leaderboards(type);

-- Apply trigger to leaderboards table
DROP TRIGGER IF EXISTS update_leaderboards_updated_at ON leaderboards;
CREATE TRIGGER update_leaderboards_updated_at BEFORE UPDATE ON leaderboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== TEAM BATTLES ====================

-- Team battles table (competition between 2-4 teams)
CREATE TABLE IF NOT EXISTS team_battles (
  id SERIAL PRIMARY KEY,
  leaderboard_id VARCHAR(255) REFERENCES leaderboards(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,

  -- Victory condition: how to determine the winner
  victory_condition VARCHAR(50) NOT NULL CHECK (victory_condition IN ('first_to_target', 'highest_at_end', 'best_average')),

  -- Victory metric: what to measure
  victory_metric VARCHAR(50) NOT NULL CHECK (victory_metric IN ('commission', 'deals', 'order_per_hour', 'sms_rate')),

  -- Target value (only used for first_to_target)
  target_value DECIMAL(10, 2),

  -- Status
  is_active BOOLEAN DEFAULT true,
  winner_team_id INTEGER, -- Will reference team_battle_teams(id) after creation

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team battle teams table (2-4 teams per battle)
CREATE TABLE IF NOT EXISTS team_battle_teams (
  id SERIAL PRIMARY KEY,
  battle_id INTEGER REFERENCES team_battles(id) ON DELETE CASCADE,
  team_name VARCHAR(255) NOT NULL,
  team_emoji VARCHAR(10), -- Optional emoji (🇹🇭, 🇸🇪, etc)
  color VARCHAR(7) NOT NULL, -- Hex color (#FF6B6B)
  user_group_ids INTEGER[] NOT NULL, -- Array of Adversus group IDs
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure unique team names within a battle
  UNIQUE(battle_id, team_name)
);

-- Add foreign key for winner after team_battle_teams is created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_team_battles_winner'
  ) THEN
    ALTER TABLE team_battles
    ADD CONSTRAINT fk_team_battles_winner
    FOREIGN KEY (winner_team_id) REFERENCES team_battle_teams(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Indexes for team battles
CREATE INDEX IF NOT EXISTS idx_team_battles_leaderboard_id ON team_battles(leaderboard_id);
CREATE INDEX IF NOT EXISTS idx_team_battles_is_active ON team_battles(is_active);
CREATE INDEX IF NOT EXISTS idx_team_battles_dates ON team_battles(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_team_battle_teams_battle_id ON team_battle_teams(battle_id);

-- Trigger for updated_at on team_battles
DROP TRIGGER IF EXISTS update_team_battles_updated_at ON team_battles;
CREATE TRIGGER update_team_battles_updated_at BEFORE UPDATE ON team_battles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
