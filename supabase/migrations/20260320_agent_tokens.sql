-- 20260320_agent_tokens.sql
--
-- Agent token bonding curve tables.
--
-- Each agent can launch one token (agent_token_curves).
-- All buy/sell trades are recorded in agent_token_trades.
-- On graduation the curve row is marked graduated=true and
-- liquidity migration to Raydium is handled off-chain.

-- ---------------------------------------------------------------------------
-- agent_token_curves
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_token_curves (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID        NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,

  -- Token metadata
  token_symbol        TEXT        NOT NULL,               -- e.g. "ORACLE"
  token_name          TEXT        NOT NULL,               -- e.g. "Oracle Agent Token"
  description         TEXT,
  image_url           TEXT,

  -- Reserves (stored in RELAY units, not base units)
  real_relay_reserve  NUMERIC(20,6) NOT NULL DEFAULT 0,
  real_token_reserve  NUMERIC(20,6) NOT NULL DEFAULT 1000000000,  -- 1B supply starts in curve

  -- Accumulated protocol fees
  total_fees_collected NUMERIC(20,6) NOT NULL DEFAULT 0,

  -- State
  graduated           BOOLEAN     NOT NULL DEFAULT false,
  graduated_at        TIMESTAMPTZ,
  raydium_pool_id     TEXT,                              -- set after graduation

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- agent_token_trades
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_token_trades (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  curve_id          UUID        NOT NULL REFERENCES agent_token_curves(id) ON DELETE CASCADE,
  agent_id          UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trader_wallet     TEXT        NOT NULL,

  side              TEXT        NOT NULL CHECK (side IN ('buy', 'sell')),

  -- Buy: relay_amount in, tokens_amount out
  -- Sell: tokens_amount in, relay_amount out
  relay_amount      NUMERIC(20,6) NOT NULL,
  tokens_amount     NUMERIC(20,6) NOT NULL,
  fee_amount        NUMERIC(20,6) NOT NULL,
  price_per_token   NUMERIC(20,10) NOT NULL,

  -- Reserve snapshot after trade (for charting)
  relay_reserve_after NUMERIC(20,6) NOT NULL,
  token_reserve_after NUMERIC(20,6) NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- agent_token_holders
-- ---------------------------------------------------------------------------
-- Balance table — updated on every trade. Simplifies "who holds what" queries.

CREATE TABLE IF NOT EXISTS agent_token_holders (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  curve_id    UUID      NOT NULL REFERENCES agent_token_curves(id) ON DELETE CASCADE,
  agent_id    UUID      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wallet      TEXT      NOT NULL,
  balance     NUMERIC(20,6) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (curve_id, wallet)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_curves_agent     ON agent_token_curves  (agent_id);
CREATE INDEX IF NOT EXISTS idx_trades_curve     ON agent_token_trades  (curve_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_wallet    ON agent_token_trades  (trader_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_holders_curve    ON agent_token_holders (curve_id, balance DESC);
CREATE INDEX IF NOT EXISTS idx_holders_wallet   ON agent_token_holders (wallet);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE agent_token_curves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_token_trades  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_token_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY curves_read_all  ON agent_token_curves  FOR SELECT USING (true);
CREATE POLICY trades_read_all  ON agent_token_trades  FOR SELECT USING (true);
CREATE POLICY holders_read_all ON agent_token_holders FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- View: token_leaderboard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW token_leaderboard AS
  SELECT
    c.id             AS curve_id,
    c.agent_id,
    a.handle,
    a.display_name,
    c.token_symbol,
    c.token_name,
    c.real_relay_reserve,
    c.real_token_reserve,
    c.graduated,
    c.total_fees_collected,
    -- price = (realRelay + 30) / (realTokens + 1073000191)
    (c.real_relay_reserve + 30.0) / (c.real_token_reserve + 1073000191.0) AS price,
    -- market cap = price * 1B total supply
    ((c.real_relay_reserve + 30.0) / (c.real_token_reserve + 1073000191.0)) * 1000000000 AS market_cap_relay,
    LEAST(c.real_relay_reserve / 69000.0, 1.0) AS graduation_progress,
    c.created_at
  FROM agent_token_curves c
  JOIN agents a ON a.id = c.agent_id
  ORDER BY c.real_relay_reserve DESC;
