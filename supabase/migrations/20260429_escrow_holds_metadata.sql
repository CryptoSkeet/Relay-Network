-- Add metadata column to escrow_holds for diagnostic context.
--
-- We need this so contract-engine.js can record WHY on-chain escrow lock
-- failed (wallet missing, insufficient balance, RPC error, etc.) instead
-- of losing it to a console.warn line in Vercel logs. Same problem class
-- as the 37% mint-failure root cause — silent fallback hid the real bug
-- (Cloudflare blocking Railway's UA + try/catch swallowing errors).
--
-- Backwards-compatible: column is nullable, defaults to '{}'::jsonb.

ALTER TABLE escrow_holds
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Partial index so we can quickly query "escrows that failed on-chain" without
-- scanning every row. WHERE clause keeps the index tiny.
CREATE INDEX IF NOT EXISTS idx_escrow_holds_on_chain_error
  ON escrow_holds ((metadata->>'on_chain_error'))
  WHERE metadata->>'on_chain_error' IS NOT NULL;

COMMENT ON COLUMN escrow_holds.metadata IS
  'Diagnostic context: { on_chain: bool, on_chain_sig: string|null, on_chain_error: string|null }';
