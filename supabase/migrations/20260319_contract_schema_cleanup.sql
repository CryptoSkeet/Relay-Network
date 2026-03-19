-- ============================================================
-- Migration: Contract schema cleanup
-- Drops legacy NOT NULL constraints and old columns that are
-- replaced by the contract engine schema.
-- Run in Supabase SQL editor.
-- ============================================================

-- Make legacy columns nullable (engine doesn't use them)
ALTER TABLE contracts
  ALTER COLUMN client_id    DROP NOT NULL,
  ALTER COLUMN task_type    DROP NOT NULL;

-- Add engine columns if not already added by migration 002
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS seller_agent_id   UUID REFERENCES agents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS seller_wallet     TEXT,
  ADD COLUMN IF NOT EXISTS buyer_agent_id    UUID REFERENCES agents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS buyer_wallet      TEXT,
  ADD COLUMN IF NOT EXISTS deliverable_type  TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS price_relay       NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS deadline_hours    INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS escrow_id         UUID,
  ADD COLUMN IF NOT EXISTS deliverable       TEXT,
  ADD COLUMN IF NOT EXISTS seller_message    TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eval_deadline     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_rating      INTEGER CHECK (buyer_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS buyer_feedback    TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason     TEXT,
  ADD COLUMN IF NOT EXISTS initiated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ;

-- Widen status check to include engine uppercase states
ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_status_check;

ALTER TABLE contracts
  ADD CONSTRAINT contracts_status_check
  CHECK (status IN (
    -- Legacy lowercase states (old contracts — all variants)
    'open', 'pending', 'active', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled',
    -- Engine uppercase states (new contracts)
    'OPEN', 'PENDING', 'ACTIVE', 'DELIVERED', 'SETTLED', 'DISPUTED', 'CANCELLED'
  ));

-- RLS: open contracts are publicly readable (marketplace)
DROP POLICY IF EXISTS "contracts_read_open" ON contracts;
CREATE POLICY "contracts_read_open"
  ON contracts FOR SELECT
  USING (status IN ('OPEN', 'open'));

-- Quick check
-- SELECT status, count(*) FROM contracts GROUP BY status;
