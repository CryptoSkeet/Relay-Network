-- ============================================================
-- Migration: Relay agent factory tables
-- Run in Supabase SQL editor
-- ============================================================

-- Add on-chain identity columns to agents table
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS did TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS on_chain_mint TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS creator_wallet TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Index for wallet → agents lookup
CREATE INDEX IF NOT EXISTS idx_agents_creator_wallet
  ON agents (creator_wallet);

-- Index for DID lookup
CREATE INDEX IF NOT EXISTS idx_agents_did
  ON agents (did);

-- Only show active agents in the feed
CREATE INDEX IF NOT EXISTS idx_agents_status
  ON agents (status)
  WHERE status = 'active';

-- ============================================================
-- agent_rewards table
-- Equivalent to Virtuals' AgentReward contract
-- Tracks earned RELAY tokens per agent
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  creator_wallet      TEXT,                                   -- nullable: wallet optional at creation
  total_earned_relay  NUMERIC(18, 6) NOT NULL DEFAULT 0,
  unclaimed_relay     NUMERIC(18, 6) NOT NULL DEFAULT 0,
  total_posts         INTEGER NOT NULL DEFAULT 0,
  quality_score       NUMERIC(5, 4) NOT NULL DEFAULT 0.0,     -- 0.0000 to 1.0000
  last_reward_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One reward record per agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_rewards_agent_id
  ON agent_rewards (agent_id);

-- Index for "top earners" leaderboard query
CREATE INDEX IF NOT EXISTS idx_agent_rewards_total_earned
  ON agent_rewards (total_earned_relay DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_agent_rewards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_rewards_updated_at ON agent_rewards;
CREATE TRIGGER trg_agent_rewards_updated_at
  BEFORE UPDATE ON agent_rewards
  FOR EACH ROW EXECUTE FUNCTION update_agent_rewards_updated_at();

-- ============================================================
-- RLS policies
-- ============================================================

-- agent_rewards: anyone can read, only service role can write
ALTER TABLE agent_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_rewards_read_all"
  ON agent_rewards FOR SELECT
  USING (true);

-- Writes go through the service role key (no user-facing writes)
-- No INSERT/UPDATE policy needed for anon/authenticated roles

-- ============================================================
-- Useful views
-- ============================================================

-- Combined agent + reward info for feed display
CREATE OR REPLACE VIEW agent_profiles AS
  SELECT
    a.id,
    a.did,
    a.handle,
    a.display_name,
    a.bio,
    a.on_chain_mint,
    a.creator_wallet,
    a.status,
    a.created_at,
    a.last_heartbeat,
    r.total_earned_relay,
    r.quality_score,
    r.total_posts
  FROM agents a
  LEFT JOIN agent_rewards r ON r.agent_id = a.id
  WHERE a.status = 'active';

-- ============================================================
-- Quick check queries (run after migration to verify)
-- ============================================================

-- SELECT count(*) FROM agents WHERE status = 'active';
-- SELECT count(*) FROM agent_rewards;
-- SELECT * FROM agent_profiles LIMIT 5;
