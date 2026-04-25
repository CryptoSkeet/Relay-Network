-- ============================================================================
-- Pass C — Pre-rewrite back-fill: orphan reason + PAYMENT_BLOCKED + snapshot
-- ============================================================================
--
-- Cross-check verified (2026-04-25, scripts/verify-orphan-classification.mjs):
--   - 17 of 18 orphans are native (in-app generated) wallets, 1 is an
--     external_agent that already completed claim. Probe sanity-tested
--     against 5 known-good wallets (5/5 decrypted to 64-byte keys).
--   - GCM (relay-wallet-v1) FAILS for all 18 under current env key.
--   - CBC (relay-custodial-did-v1) FAILS for all 18 too.
--   - Conclusion: the cause is a historical SOLANA_WALLET_ENCRYPTION_KEY
--     rotation, not a missing CBC fallback. These wallets are unsignable
--     under the current env key. Reason code: 'legacy_env_key_2026_04'.
--
-- Context:
--   Pass C item 2 will add an orphan-payee filter to the autonomous payment
--   loop (heartbeat + contract-engine), so that mints stop going to wallets
--   whose private keys are unrecoverable. The audit at 2026-04-25 found:
--     - 18 wallets with key_orphaned_at IS NOT NULL
--     - 325 unpaid contracts (status IN completed/SETTLED/delivered/DELIVERED,
--       relay_paid = false OR NULL) whose payee is one of those 18 agents
--
--   Once the rewrite ships, those 325 rows would be silently skipped by the
--   payment loop and stay unpaid forever with no visible signal. This
--   migration moves them to a new explicit status (PAYMENT_BLOCKED) so they
--   are discoverable in the admin UI and a human can either:
--     (a) restore the wallet's encrypted_private_key, set key_orphaned_at
--         back to NULL, then transition status back to 'SETTLED' for the
--         loop to re-pick, OR
--     (b) explicitly forfeit the payment by transitioning to 'cancelled'.
--
-- Reversibility:
--   The new constraint is additive (the existing states are still allowed).
--   To roll back the back-fill itself:
--     UPDATE contracts SET status = 'SETTLED' WHERE status = 'PAYMENT_BLOCKED';
--   The PAYMENT_BLOCKED state can stay in the constraint indefinitely.
--
-- Idempotency:
--   - The CHECK widening uses DROP/ADD which is implicitly idempotent.
--   - The UPDATE filters by current status, so a second run is a no-op.
-- ============================================================================

BEGIN;

-- 0. Forensic column on solana_wallets: WHY this wallet is orphaned.
--    NULL for signable wallets, free-form short code for orphans.
ALTER TABLE solana_wallets
  ADD COLUMN IF NOT EXISTS key_orphan_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN solana_wallets.key_orphan_reason IS
  'Forensic code explaining why key_orphaned_at was set. Examples: '
  '''legacy_env_key_2026_04'' (env key rotated, ciphertext no longer decrypts), '
  '''claim_overwrite'' (re-keyed during external_agent claim).';

-- 0a. Back-fill the 18 known orphans (audit 2026-04-24, see migration
--     20260424_solana_wallets_orphaned.sql for the agent-id list).
--     Idempotent via WHERE key_orphan_reason IS NULL.
UPDATE solana_wallets
SET    key_orphan_reason = 'legacy_env_key_2026_04'
WHERE  key_orphaned_at IS NOT NULL
  AND  key_orphan_reason IS NULL;

-- 1. Widen the status CHECK to include PAYMENT_BLOCKED.
ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_status_check;

ALTER TABLE contracts
  ADD CONSTRAINT contracts_status_check
  CHECK (status IN (
    -- Legacy lowercase states
    'open', 'pending', 'active', 'in_progress', 'delivered', 'completed',
    'disputed', 'cancelled',
    -- Engine uppercase states
    'OPEN', 'PENDING', 'ACTIVE', 'DELIVERED', 'SETTLED', 'DISPUTED', 'CANCELLED',
    -- New: Pass C — payee wallet is orphaned, mint suppressed
    'PAYMENT_BLOCKED'
  ));

-- 2. Back-fill: move orphaned-payee unpaid contracts to PAYMENT_BLOCKED.
--    "Payee" is seller_agent_id (engine) with provider_id (legacy) fallback.
--    "Unpaid" is relay_paid IS NOT TRUE (handles both NULL and FALSE).
--    "Eligible status" is the set the autonomous loop currently picks up.
--    First, snapshot the rows we're about to move so we have a forensic
--    record (amount, payee, original status, timestamps) — keep regardless
--    of whether the rows are later reclassified or recovered.
CREATE TABLE IF NOT EXISTS contracts_payment_blocked_20260425 (
  contract_id      UUID PRIMARY KEY,
  payee_agent_id   UUID,
  payee_pubkey     TEXT,
  original_status  TEXT NOT NULL,
  amount_relay     NUMERIC,
  relay_paid       BOOLEAN,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  snapshotted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH orphaned_agents AS (
  SELECT agent_id
  FROM solana_wallets
  WHERE key_orphaned_at IS NOT NULL
),
to_block AS (
  SELECT c.id              AS contract_id,
         COALESCE(c.seller_agent_id, c.provider_id) AS payee_agent_id,
         sw.public_key     AS payee_pubkey,
         c.status          AS original_status,
         COALESCE(c.price_relay, c.final_price) AS amount_relay,
         c.relay_paid,
         c.created_at,
         c.updated_at
  FROM   contracts c
  LEFT JOIN solana_wallets sw
         ON sw.agent_id = COALESCE(c.seller_agent_id, c.provider_id)
  WHERE  c.status IN ('completed', 'SETTLED', 'delivered', 'DELIVERED')
    AND  COALESCE(c.relay_paid, FALSE) = FALSE
    AND  COALESCE(c.seller_agent_id, c.provider_id) IN (SELECT agent_id FROM orphaned_agents)
)
INSERT INTO contracts_payment_blocked_20260425
  (contract_id, payee_agent_id, payee_pubkey, original_status,
   amount_relay, relay_paid, created_at, updated_at)
SELECT contract_id, payee_agent_id, payee_pubkey, original_status,
       amount_relay, relay_paid, created_at, updated_at
FROM   to_block
ON CONFLICT (contract_id) DO NOTHING;

WITH orphaned_agents AS (
  SELECT agent_id
  FROM solana_wallets
  WHERE key_orphaned_at IS NOT NULL
)
UPDATE contracts c
SET    status = 'PAYMENT_BLOCKED'
WHERE  c.status IN ('completed', 'SETTLED', 'delivered', 'DELIVERED')
  AND  COALESCE(c.relay_paid, FALSE) = FALSE
  AND  COALESCE(c.seller_agent_id, c.provider_id) IN (SELECT agent_id FROM orphaned_agents);

-- 3. Partial index so the payment loop's "find unpaid" queries cheaply skip
--    PAYMENT_BLOCKED rows. The existing idx_contracts_relay_paid only covers
--    status = 'completed'; this one covers the engine path.
CREATE INDEX IF NOT EXISTS idx_contracts_unpaid_payable
  ON contracts (seller_agent_id, status)
  WHERE status IN ('SETTLED', 'DELIVERED', 'completed', 'delivered')
    AND COALESCE(relay_paid, FALSE) = FALSE;

COMMIT;

-- Post-migration verification (run separately):
--   SELECT status, COUNT(*) FROM contracts WHERE status = 'PAYMENT_BLOCKED' GROUP BY status;
--   -- Expected: 325 (matches audit count at 2026-04-25)
