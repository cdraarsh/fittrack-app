-- Native push notification columns for ft_push_subscriptions
-- Adds push_type, native_token, native_platform to support APNs (iOS) and FCM (Android)
-- alongside the existing Web Push (VAPID) subscriptions.

ALTER TABLE ft_push_subscriptions
  ADD COLUMN IF NOT EXISTS push_type      text NOT NULL DEFAULT 'web'
    CHECK (push_type IN ('web', 'native')),
  ADD COLUMN IF NOT EXISTS native_token   text,
  ADD COLUMN IF NOT EXISTS native_platform text
    CHECK (native_platform IN ('android', 'ios') OR native_platform IS NULL);

-- Backfill: all existing rows are web push subscriptions.
-- Without this, the first cron run would try to FCM-send to rows with no native_token.
UPDATE ft_push_subscriptions
  SET push_type = 'web'
  WHERE push_type IS NULL OR push_type = '';

-- Index for cron: fetch only native tokens for FCM/APNs batch send
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_native
  ON ft_push_subscriptions (native_platform)
  WHERE push_type = 'native';
