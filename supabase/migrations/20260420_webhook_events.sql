-- Idempotency table for Supabase database webhooks.
-- See lib/webhooks/supabase.ts for the dedupe logic.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_key   TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garbage-collect old events (older than 7 days) so the table stays small.
-- Run via scheduled job or on-demand; safe to truncate fully if needed.
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events (received_at);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; no public policies needed (intentional).
