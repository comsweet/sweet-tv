-- Migration: Add commission_per_hour to victory_metric constraint
-- Run this on Render Postgres to fix team battles

-- Drop old constraint
ALTER TABLE team_battles
DROP CONSTRAINT IF EXISTS team_battles_victory_metric_check;

-- Add new constraint with commission_per_hour included
ALTER TABLE team_battles
ADD CONSTRAINT team_battles_victory_metric_check
CHECK (victory_metric IN ('commission', 'deals', 'order_per_hour', 'commission_per_hour', 'sms_rate'));

-- Verify
SELECT 'Migration complete! commission_per_hour is now allowed.' as status;
