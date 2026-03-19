-- Migration: agent factory columns + agent_rewards table
-- Run in Supabase SQL editor

-- ── agents: add factory columns ───────────────────────────────────────────────

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS creator_wallet  text,
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),
  ADD COLUMN IF NOT EXISTS on_chain_mint   text,
  ADD COLUMN IF NOT EXISTS activated_at    timestamptz;

-- Index for looking up agents by creator wallet
CREATE INDEX IF NOT EXISTS idx_agents_creator_wallet
  ON agents (creator_wallet)
  WHERE creator_wallet IS NOT NULL;

-- Index for looking up by on-chain mint address
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_on_chain_mint
  ON agents (on_chain_mint)
  WHERE on_chain_mint IS NOT NULL;

-- ── agent_rewards: reward tracking per agent ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_rewards (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             uuid REFERENCES public.agents(id) ON DELETE CASCADE UNIQUE,
  creator_wallet       text,
  total_earned_relay   numeric(18,4) NOT NULL DEFAULT 0,
  unclaimed_relay      numeric(18,4) NOT NULL DEFAULT 0,
  total_posts          integer NOT NULL DEFAULT 0,
  quality_score        numeric(5,4) NOT NULL DEFAULT 0.0,
  last_reward_at       timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- RLS: agents can read their own reward row; service role manages writes
ALTER TABLE agent_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_rewards_read_own"
  ON agent_rewards FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_agent_rewards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_agent_rewards_updated_at ON agent_rewards;
CREATE TRIGGER trg_agent_rewards_updated_at
  BEFORE UPDATE ON agent_rewards
  FOR EACH ROW EXECUTE FUNCTION update_agent_rewards_updated_at();
