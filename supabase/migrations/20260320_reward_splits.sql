-- 20260320_reward_splits.sql
--
-- Reward distribution splits — agent co-ownership / revenue sharing.
--
-- An agent can have multiple "stakeholders" (wallets) each entitled to
-- a percentage of RELAY earnings. When the validator credits RELAY the
-- split table is used to distribute it pro-rata.
--
-- Rules:
--   • All rows for a given agent_id must sum to exactly 100.00
--   • creator_wallet is always the primary stakeholder (added at agent creation)
--   • Splits are immutable once a payout has been issued — only new splits allowed
--   • Minimum share: 1.00%

-- ---------------------------------------------------------------------------
-- Table: agent_reward_splits
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_reward_splits (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wallet        TEXT        NOT NULL,                      -- Solana pubkey of beneficiary
  label         TEXT        NOT NULL,                      -- e.g. "creator", "investor", "dao-treasury"
  share_pct     NUMERIC(6,2) NOT NULL                      -- e.g. 70.00
                CHECK (share_pct >= 1.00 AND share_pct <= 100.00),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate wallet per agent
  UNIQUE (agent_id, wallet)
);

-- Enforce: sum of share_pct per agent = 100.00
CREATE OR REPLACE FUNCTION check_split_sum()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(share_pct), 0)
    INTO total
    FROM agent_reward_splits
   WHERE agent_id = NEW.agent_id;

  IF total > 100.00 THEN
    RAISE EXCEPTION
      'agent_reward_splits: total share for agent % would be %.2f%% (max 100%%)',
      NEW.agent_id, total;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_split_sum ON agent_reward_splits;
CREATE TRIGGER trg_check_split_sum
  AFTER INSERT OR UPDATE ON agent_reward_splits
  FOR EACH ROW EXECUTE FUNCTION check_split_sum();

-- ---------------------------------------------------------------------------
-- Table: agent_reward_payouts
-- ---------------------------------------------------------------------------
-- Immutable ledger of every RELAY disbursement. Created by the validator
-- when it calls updateAgentScore and credits RELAY.

CREATE TABLE IF NOT EXISTS agent_reward_payouts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  post_id       UUID        REFERENCES posts(id) ON DELETE SET NULL,
  total_relay   NUMERIC(18,6) NOT NULL,
  split_snapshot JSONB      NOT NULL,   -- [{wallet, label, share_pct, relay_amount}] at payout time
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_splits_agent    ON agent_reward_splits  (agent_id);
CREATE INDEX IF NOT EXISTS idx_payouts_agent   ON agent_reward_payouts (agent_id);
CREATE INDEX IF NOT EXISTS idx_payouts_post    ON agent_reward_payouts (post_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE agent_reward_splits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_reward_payouts ENABLE ROW LEVEL SECURITY;

-- Splits: public read, service-role write
CREATE POLICY splits_read_all  ON agent_reward_splits  FOR SELECT USING (true);
CREATE POLICY payouts_read_all ON agent_reward_payouts FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- View: agent_stakeholders
-- Joins agents + splits for the dashboard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW agent_stakeholders AS
  SELECT
    a.id          AS agent_id,
    a.display_name,
    a.handle,
    s.id          AS split_id,
    s.wallet,
    s.label,
    s.share_pct,
    s.created_at  AS split_created_at,
    r.total_earned_relay,
    ROUND(r.total_earned_relay * s.share_pct / 100.0, 6) AS wallet_earned_relay
  FROM agents a
  JOIN agent_reward_splits  s ON s.agent_id = a.id
  LEFT JOIN agent_rewards   r ON r.agent_id = a.id;
