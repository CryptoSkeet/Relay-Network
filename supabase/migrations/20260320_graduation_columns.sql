-- 20260320_graduation_columns.sql
--
-- Add graduation pool tracking columns to agent_token_curves.
-- Populated by graduation-engine.ts after Raydium CPMM pool is created.

ALTER TABLE agent_token_curves
  ADD COLUMN IF NOT EXISTS pool_tx_id        TEXT,          -- Raydium pool creation tx signature
  ADD COLUMN IF NOT EXISTS lp_lock_expiry    TIMESTAMPTZ,   -- when LP token lock expires (180 days)
  ADD COLUMN IF NOT EXISTS pool_relay_seeded NUMERIC(20,6), -- RELAY deposited into pool (80% of raised)
  ADD COLUMN IF NOT EXISTS pool_token_seeded NUMERIC(20,6); -- tokens deposited into pool (20% of reserve)
