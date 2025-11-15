-- Add time_period column to team_battles table
-- This allows Team Battles to use dynamic time periods (day/week/month)
-- instead of only static start_date/end_date

DO $$
BEGIN
  -- Add time_period column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_battles' AND column_name = 'time_period'
  ) THEN
    ALTER TABLE team_battles
    ADD COLUMN time_period VARCHAR(50) CHECK (time_period IN ('day', 'week', 'month', 'custom', NULL));

    RAISE NOTICE '✅ Added time_period column to team_battles';
  ELSE
    RAISE NOTICE 'ℹ️  time_period column already exists in team_battles';
  END IF;
END$$;

-- Notes:
-- - time_period can be NULL (use static start_date/end_date)
-- - If time_period is set, it overrides start_date/end_date with dynamic dates
-- - Priority: time_period > leaderboard_id > start_date/end_date
