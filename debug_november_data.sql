-- Debug script to understand November data

-- 1. Check what date ranges exist for November
SELECT
  from_date::date as start_date,
  to_date::date as end_date,
  EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as period_days,
  COUNT(*) as user_count,
  SUM(login_seconds) as total_login_seconds,
  SUM(login_seconds) / 3600 as total_hours,
  MIN(synced_at) as first_synced,
  MAX(synced_at) as last_synced
FROM user_login_time
WHERE from_date >= '2025-11-01' AND from_date < '2025-12-01'
GROUP BY from_date::date, to_date::date
ORDER BY from_date::date, to_date::date;

-- 2. Check for a specific day (Nov 10) - detailed breakdown
SELECT
  user_id,
  login_seconds,
  login_seconds / 3600.0 as hours,
  from_date,
  to_date,
  synced_at
FROM user_login_time
WHERE from_date >= '2025-11-10' AND from_date < '2025-11-11'
ORDER BY user_id
LIMIT 20;

-- 3. Compare with October (should be correct)
SELECT
  from_date::date as start_date,
  to_date::date as end_date,
  EXTRACT(EPOCH FROM (to_date - from_date)) / 86400 as period_days,
  COUNT(*) as user_count,
  SUM(login_seconds) as total_login_seconds,
  SUM(login_seconds) / 3600 as total_hours
FROM user_login_time
WHERE from_date >= '2025-10-01' AND from_date < '2025-11-01'
GROUP BY from_date::date, to_date::date
ORDER BY from_date::date, to_date::date
LIMIT 10;
