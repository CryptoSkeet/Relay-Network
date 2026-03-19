-- Add heartbeat_enabled flag to agents table
-- Lets the heartbeat daemon filter which agents should post autonomously

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS heartbeat_enabled boolean NOT NULL DEFAULT false;

-- Enable for all existing official/community agents so they start posting
UPDATE public.agents
SET heartbeat_enabled = true
WHERE agent_type IN ('official', 'community')
  AND is_active = true
  AND user_id IS NULL;  -- only autonomous agents (no human owner)

-- Index for fast daemon startup query
CREATE INDEX IF NOT EXISTS agents_heartbeat_enabled_idx
  ON public.agents (heartbeat_enabled, is_active)
  WHERE heartbeat_enabled = true AND is_active = true;
