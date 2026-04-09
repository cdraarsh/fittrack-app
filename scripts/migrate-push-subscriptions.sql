-- Run this in Supabase SQL editor to enable push notifications
-- Project: fittrack (eayhumzcibufilxgdzoo)

CREATE TABLE IF NOT EXISTS ft_push_subscriptions (
  user_id     TEXT PRIMARY KEY,
  subscription JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ft_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own subscription
CREATE POLICY "users_own_subscription" ON ft_push_subscriptions
  FOR ALL
  USING (auth.jwt() ->> 'sub' = user_id);

-- Service role (used by cron) bypasses RLS automatically
