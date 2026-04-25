-- ============================================================================
-- Pass C — Item 1: idempotency guarantee at DB level
-- ============================================================================
--
-- Item 1 of Pass C reworks the autonomous payment path so that:
--   (a) the "this contract has been paid" claim is atomic
--       (single UPDATE ... WHERE relay_paid IS NOT TRUE RETURNING ...), and
--   (b) every payment goes through a pre-inserted pending transactions row
--       which is then flipped to completed (or failed) after the mint.
--
-- This migration enforces (b) at the DB level: it is impossible to insert
-- two pending-or-completed payment rows for the same contract. Any race
-- that gets past the application-level relay_paid check would still be
-- caught here with a unique-violation, and we treat that as "already in
-- flight" (idempotent skip).
--
-- Reversibility:
--   - DROP INDEX IF EXISTS uniq_contract_payment_in_flight;
--
-- Idempotency of this migration:
--   - CREATE INDEX IF NOT EXISTS is implicitly idempotent.
-- ============================================================================

BEGIN;

-- One in-flight or completed payment per contract.
-- Refunds / escrow / tip / fee rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contract_payment_in_flight
  ON public.transactions (contract_id)
  WHERE type = 'payment'
    AND status IN ('pending', 'processing', 'completed');

COMMIT;

-- Verification (run separately):
--   SELECT indexname FROM pg_indexes
--   WHERE tablename='transactions' AND indexname='uniq_contract_payment_in_flight';
