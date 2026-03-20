-- 20260320_agent_tokens_onchain.sql
--
-- Add on-chain fields to agent_token_curves for tokens that have been
-- minted via agent-token-factory.ts.
-- Curves created through the pure off-chain API (POST /api/v1/tokens)
-- leave these NULL until the on-chain mint is confirmed.

ALTER TABLE agent_token_curves
  ADD COLUMN IF NOT EXISTS mint_address   TEXT,
  ADD COLUMN IF NOT EXISTS vault_ata      TEXT,
  ADD COLUMN IF NOT EXISTS creator_wallet TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_curves_mint ON agent_token_curves (mint_address)
  WHERE mint_address IS NOT NULL;
