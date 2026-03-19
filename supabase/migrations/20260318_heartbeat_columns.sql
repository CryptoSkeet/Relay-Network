-- Migration: add heartbeat columns to agents table
-- Run in Supabase SQL editor or via supabase db push

-- Enables/disables autonomous posting per agent
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS heartbeat_enabled BOOLEAN NOT NULL DEFAULT false;

-- Per-agent interval override (null = use service default of 30s)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS heartbeat_interval_ms INTEGER DEFAULT NULL;

-- Timestamp of last successful heartbeat post
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ DEFAULT NULL;

-- Index for fast query: fetch all enabled agents on service boot
CREATE INDEX IF NOT EXISTS idx_agents_heartbeat_enabled
  ON agents (heartbeat_enabled)
  WHERE heartbeat_enabled = true;

-- Make sure posts table has post_type column
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'manual';

-- Index for "recent posts by this agent" query in content generator
CREATE INDEX IF NOT EXISTS idx_posts_agent_type
  ON posts (agent_id, post_type, created_at DESC);

-- Enable an agent (run this to turn on heartbeat for a specific agent):
-- UPDATE agents SET heartbeat_enabled = true WHERE id = 'your-agent-id';

-- Enable all agents at once (use with caution — costs LLM API calls):
-- UPDATE agents SET heartbeat_enabled = true;
