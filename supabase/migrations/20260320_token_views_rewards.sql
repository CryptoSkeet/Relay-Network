-- 20260320_token_views_rewards.sql
--
-- Adds:
--   • relay_rewards ledger table (graduation bonus + future rewards)
--   • token_market view (price, market cap, graduation %)
--   • active_proposals view (DAO proposals with vote %s)
--
-- Note: agent_token_curves / agent_token_holders / agent_token_trades /
--       dao_proposals / dao_votes already exist from earlier migrations.

-- ---------------------------------------------------------------------------
-- relay_rewards
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS relay_rewards (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet     TEXT        NOT NULL,
  amount     NUMERIC(20,6) NOT NULL,
  reason     TEXT        NOT NULL,
  mint       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_rewards_wallet ON relay_rewards(wallet);
CREATE INDEX IF NOT EXISTS idx_relay_rewards_mint   ON relay_rewards(mint);

ALTER TABLE relay_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'relay_rewards' AND policyname = 'Public read relay_rewards'
  ) THEN
    CREATE POLICY "Public read relay_rewards" ON relay_rewards FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'relay_rewards' AND policyname = 'Service write relay_rewards'
  ) THEN
    CREATE POLICY "Service write relay_rewards" ON relay_rewards FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- token_market view
-- Price = (real_relay + 30 virtual) / (real_token + 1,073,000,191 virtual)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW token_market AS
SELECT
  atc.id                                            AS curve_id,
  atc.mint_address,
  atc.agent_id,
  a.display_name                                    AS agent_name,
  a.handle,
  a.did,
  atc.real_relay_reserve,
  atc.real_token_reserve,
  atc.graduated,
  ROUND(
    (atc.real_relay_reserve + 30.0)
    / NULLIF(atc.real_token_reserve + 1073000191.0, 0),
    8
  )                                                 AS price,
  ROUND(
    (atc.real_relay_reserve + 30.0)
    / NULLIF(atc.real_token_reserve + 1073000191.0, 0)
    * 1000000000,
    2
  )                                                 AS market_cap,
  ROUND(atc.real_relay_reserve / 69000.0 * 100, 1) AS graduation_pct,
  atc.token_symbol,
  atc.token_name,
  atc.created_at
FROM  agent_token_curves atc
JOIN  agents a ON a.id = atc.agent_id
ORDER BY market_cap DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- active_proposals view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW active_proposals AS
SELECT
  dp.*,
  a.display_name AS agent_name,
  a.handle,
  ROUND(
    CASE WHEN dp.votes_yes + dp.votes_no > 0
         THEN dp.votes_yes / (dp.votes_yes + dp.votes_no) * 100
         ELSE 0 END,
    1
  )              AS yes_pct,
  dp.voting_ends_at > NOW() AS still_open
FROM  dao_proposals dp
JOIN  agents a ON a.id = dp.agent_id
WHERE dp.status = 'ACTIVE'
ORDER BY dp.created_at DESC;

-- ---------------------------------------------------------------------------
-- RLS on existing tables (idempotent — skips if policy already exists)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  -- agent_token_curves
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_token_curves' AND policyname = 'Public read agent_token_curves') THEN
    CREATE POLICY "Public read agent_token_curves" ON agent_token_curves FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_token_curves' AND policyname = 'Service write agent_token_curves') THEN
    CREATE POLICY "Service write agent_token_curves" ON agent_token_curves FOR ALL USING (auth.role() = 'service_role');
  END IF;

  -- agent_token_holders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_token_holders' AND policyname = 'Public read agent_token_holders') THEN
    CREATE POLICY "Public read agent_token_holders" ON agent_token_holders FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_token_holders' AND policyname = 'Service write agent_token_holders') THEN
    CREATE POLICY "Service write agent_token_holders" ON agent_token_holders FOR ALL USING (auth.role() = 'service_role');
  END IF;

  -- agent_token_trades
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_token_trades' AND policyname = 'Public read agent_token_trades') THEN
    CREATE POLICY "Public read agent_token_trades" ON agent_token_trades FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_token_trades' AND policyname = 'Service write agent_token_trades') THEN
    CREATE POLICY "Service write agent_token_trades" ON agent_token_trades FOR ALL USING (auth.role() = 'service_role');
  END IF;

  -- dao_proposals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dao_proposals' AND policyname = 'Service write dao_proposals') THEN
    CREATE POLICY "Service write dao_proposals" ON dao_proposals FOR ALL USING (auth.role() = 'service_role');
  END IF;

  -- dao_votes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dao_votes' AND policyname = 'Service write dao_votes') THEN
    CREATE POLICY "Service write dao_votes" ON dao_votes FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
