-- ============================================================
-- Migration 002: Relay Contract Settlement
-- Run in Supabase SQL editor
-- ============================================================

-- ── contracts table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  seller_agent_id     UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  seller_wallet       TEXT NOT NULL,
  buyer_agent_id      UUID REFERENCES agents(id) ON DELETE RESTRICT,
  buyer_wallet        TEXT,

  -- Offer terms
  title               TEXT NOT NULL,
  description         TEXT,
  deliverable_type    TEXT NOT NULL DEFAULT 'custom',
  price_relay         NUMERIC(18, 6) NOT NULL CHECK (price_relay > 0),
  deadline_hours      INTEGER NOT NULL DEFAULT 24,
  requirements        JSONB,         -- seller's structured requirements
  buyer_requirements  JSONB,         -- buyer's specific requirements

  -- State machine
  -- OPEN → PENDING → ACTIVE → DELIVERED → SETTLED
  --                         ↘ DISPUTED  → SETTLED | CANCELLED
  --              ↘ CANCELLED (at any non-terminal state)
  status              TEXT NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','PENDING','ACTIVE','DELIVERED','SETTLED','DISPUTED','CANCELLED')),

  -- Escrow reference
  escrow_id           UUID,          -- FK to escrow_holds (set on initiate)

  -- Delivery
  deliverable         TEXT,          -- the actual work product
  seller_message      TEXT,          -- seller's note on accept
  delivered_at        TIMESTAMPTZ,
  eval_deadline       TIMESTAMPTZ,   -- deadline for buyer to evaluate after delivery

  -- Settlement
  buyer_rating        INTEGER CHECK (buyer_rating BETWEEN 1 AND 5),
  buyer_feedback      TEXT,
  cancel_reason       TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  initiated_at        TIMESTAMPTZ,
  accepted_at         TIMESTAMPTZ,
  settled_at          TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON contracts (status);

CREATE INDEX IF NOT EXISTS idx_contracts_seller
  ON contracts (seller_agent_id, status);

CREATE INDEX IF NOT EXISTS idx_contracts_buyer
  ON contracts (buyer_agent_id, status);

CREATE INDEX IF NOT EXISTS idx_contracts_created
  ON contracts (created_at DESC);

-- ── escrow_holds table ───────────────────────────────────────────────────────
-- Tracks RELAY locked per contract.
-- Phase 1: Supabase bookkeeping only.
-- Phase 2: Replace with on-chain SPL token hold via Relay escrow program.

CREATE TABLE IF NOT EXISTS escrow_holds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  buyer_agent_id   UUID NOT NULL REFERENCES agents(id),
  buyer_wallet     TEXT NOT NULL,
  amount_relay     NUMERIC(18, 6) NOT NULL CHECK (amount_relay > 0),

  -- LOCKED → RELEASED (to seller) | REFUNDED (to buyer)
  status           TEXT NOT NULL DEFAULT 'LOCKED'
                   CHECK (status IN ('LOCKED', 'RELEASED', 'REFUNDED')),

  locked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at      TIMESTAMPTZ
);

-- Add FK from contracts to escrow_holds (deferred to avoid circular dep)
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_escrow
  FOREIGN KEY (escrow_id) REFERENCES escrow_holds(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_escrow_contract
  ON escrow_holds (contract_id);

CREATE INDEX IF NOT EXISTS idx_escrow_buyer
  ON escrow_holds (buyer_agent_id, status);

-- ── api_keys table ───────────────────────────────────────────────────────────
-- For SDK/CLI/agent-to-agent auth (the other half of the 403 fix)

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wallet       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 hash, never raw key
  name         TEXT,                   -- friendly label ("CLI key", "heartbeat key")
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_agent
  ON api_keys (agent_id);

-- ── RLS policies ─────────────────────────────────────────────────────────────

ALTER TABLE contracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys     ENABLE ROW LEVEL SECURITY;

-- contracts: anyone can read OPEN contracts (marketplace feed)
DROP POLICY IF EXISTS "contracts_read_open" ON contracts;
CREATE POLICY "contracts_read_open"
  ON contracts FOR SELECT
  USING (status = 'OPEN');

-- contracts: parties can read their own contracts
DROP POLICY IF EXISTS "contracts_read_parties" ON contracts;
CREATE POLICY "contracts_read_parties"
  ON contracts FOR SELECT
  USING (
    seller_wallet = current_setting('request.jwt.claims', true)::json->>'wallet'
    OR
    buyer_wallet  = current_setting('request.jwt.claims', true)::json->>'wallet'
  );

-- All writes go through the service role (API routes with SUPABASE_SERVICE_ROLE_KEY)
-- No user-facing INSERT/UPDATE/DELETE policies needed

-- escrow_holds: parties can read
DROP POLICY IF EXISTS "escrow_read_parties" ON escrow_holds;
CREATE POLICY "escrow_read_parties"
  ON escrow_holds FOR SELECT
  USING (
    buyer_wallet = current_setting('request.jwt.claims', true)::json->>'wallet'
  );

-- api_keys: owners can read their own keys
DROP POLICY IF EXISTS "api_keys_read_own" ON api_keys;
CREATE POLICY "api_keys_read_own"
  ON api_keys FOR SELECT
  USING (
    wallet = current_setting('request.jwt.claims', true)::json->>'wallet'
  );

-- ── credit_relay_reward RPC ──────────────────────────────────────────────────
-- Called by settleContract() to credit the seller after settlement.

CREATE OR REPLACE FUNCTION credit_relay_reward(
  p_agent_id    UUID,
  p_amount      NUMERIC,
  p_contract_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as superuser, bypasses RLS
AS $$
BEGIN
  INSERT INTO agent_rewards (agent_id, creator_wallet, total_earned_relay, unclaimed_relay)
  SELECT p_agent_id, a.creator_wallet, p_amount, p_amount
  FROM agents a WHERE a.id = p_agent_id
  ON CONFLICT (agent_id) DO UPDATE SET
    total_earned_relay = agent_rewards.total_earned_relay + EXCLUDED.total_earned_relay,
    unclaimed_relay    = agent_rewards.unclaimed_relay    + EXCLUDED.unclaimed_relay,
    total_posts        = agent_rewards.total_posts + 1,
    last_reward_at     = now(),
    updated_at         = now();
END;
$$;

-- ── Useful queries ───────────────────────────────────────────────────────────

-- Open marketplace feed:
-- SELECT c.*, a.display_name as seller_name
-- FROM contracts c JOIN agents a ON a.id = c.seller_agent_id
-- WHERE c.status = 'OPEN' ORDER BY c.created_at DESC LIMIT 20;

-- My contracts as seller:
-- SELECT * FROM contracts WHERE seller_wallet = 'YOUR_WALLET' ORDER BY created_at DESC;

-- My contracts as buyer:
-- SELECT * FROM contracts WHERE buyer_wallet = 'YOUR_WALLET' ORDER BY created_at DESC;

-- Locked escrow total:
-- SELECT SUM(amount_relay) FROM escrow_holds WHERE status = 'LOCKED';
