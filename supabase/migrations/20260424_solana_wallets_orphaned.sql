-- Migration: mark wallets whose keys can't be decrypted with current env.
-- Source of truth: scripts/audit-agent-keys.ts → agents-undecryptable.json
-- Audit run: 2026-04-24, errorKind=DECRYPTION_FAILED for all 18 listed below.
--
-- Design:
--   - Add `key_orphaned_at TIMESTAMPTZ` column, NULL = signable (active)
--   - NOT NULL = orphaned at that timestamp (historical record)
--
-- Why timestamp over enum:
--   - Captures when orphaning happened (forensic value)
--   - Partial index is cheaper than CHECK + indexed enum
--   - Reversible without migrating values: UPDATE ... SET key_orphaned_at = NULL
--
-- Deliberately NOT deleting the rows:
--   - Public keys are visible on-chain; deleting the DB row doesn't undo that
--   - Future key recovery could reactivate them
--   - Accountability: you want to know what you orphaned
--
-- NOT adding `encryption_key_id` yet. That's the Phase 4+ "proper" key
-- rotation solution. For now, one env key, one orphaning timestamp.
--
-- Pre-flight (verified 2026-04-24):
--   RELAY mint authority = GafmHBZRd4VkAA3eAirKWfYvwfDTGoPwaF4vffemwZkV
--   (treasury / RELAY_PAYER_SECRET_KEY) — NOT in the orphan list. Safe to proceed.

BEGIN;

ALTER TABLE solana_wallets
  ADD COLUMN IF NOT EXISTS key_orphaned_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: only orphaned rows are indexed. Keeps the index tiny
-- (~18 entries today) while letting queries for signable wallets stay
-- fast via the existing agent_id PK/unique constraint.
CREATE INDEX IF NOT EXISTS solana_wallets_orphaned_idx
  ON solana_wallets (key_orphaned_at)
  WHERE key_orphaned_at IS NOT NULL;

-- Mark the 18 orphans. Idempotent: re-running won't reset timestamps
-- on rows already marked.
UPDATE solana_wallets
SET key_orphaned_at = NOW()
WHERE agent_id IN (
  '273a4efb-1d29-4957-ab5b-2adfbd447c67',
  '28388ce7-6ded-4193-8150-e2876e0b95e3',
  '2a1a7ac9-b77d-42a0-974d-faedec5ce90d',
  '39b309b6-f9ff-4055-a8cb-0c0dc706e769',
  '43a458db-d5ba-424b-af60-c1d3d971e6f8',
  '447c9a3e-d800-4de7-ae1d-c2efecbe8c6a',
  '5099308c-2dc9-4adc-9823-c81890b04a8d',
  '825d19a3-9732-4565-9767-4987fc1c3a5c',
  '866e52bd-4fdb-4239-ab36-6818e54a9f5b',
  '8b228934-8bf6-4130-a07e-819f1dec3a76',
  '9caf02b2-62c9-413d-8fe7-422f7074a718',
  'abf1451f-6a2b-4211-8f0b-690a74538c02',
  'b65928b8-f1ef-4204-82b6-6b31dc44d22d',
  'b93e21ab-b419-4469-8abe-31b193af835d',
  'bd1837a3-5534-47ad-906c-2f02b5d1a460',
  'c08867c4-1355-46d3-af77-4af2cee04e93',
  'e82a42a3-51b3-4932-ae11-4c15bbff22d9',
  'ef860128-7fbc-49d2-b28c-8fe83d5dcf6b'
)
AND key_orphaned_at IS NULL;

COMMIT;

-- Post-migration sanity check (run separately to verify):
--
-- SELECT
--   COUNT(*) FILTER (WHERE key_orphaned_at IS NULL) AS signable,
--   COUNT(*) FILTER (WHERE key_orphaned_at IS NOT NULL) AS orphaned,
--   COUNT(*) AS total
-- FROM solana_wallets;
--
-- Expected: signable=99, orphaned=18, total=117
