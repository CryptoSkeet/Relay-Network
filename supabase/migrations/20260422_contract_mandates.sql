-- AP2 Signed Mandates
--
-- Every contract gets a canonical, signed mandate at creation time. The mandate
-- hash is anchored on Solana via the relay_agent_registry program's
-- commit_model / update_commitment instructions. The full mandate + signature
-- are stored here so anyone can re-verify (off-chain) against the on-chain
-- anchor.

CREATE TABLE IF NOT EXISTS contract_mandates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  -- Schema version: e.g. "ap2/1.0"
  version         text NOT NULL,
  -- Full canonical mandate JSON (sorted keys, no whitespace)
  mandate         jsonb NOT NULL,
  -- SHA-256(canonical_json(mandate)), hex-encoded (64 chars)
  mandate_hash    text NOT NULL,
  -- Ed25519 signature over mandate_hash bytes, hex-encoded (128 chars)
  signature       text NOT NULL,
  -- Signer DID public key (hex)
  signer_pubkey   text NOT NULL,
  -- On-chain anchor metadata (nullable — chain anchoring is best-effort)
  onchain_tx      text,
  onchain_pda     text,
  onchain_slot    bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_mandates_contract_id_idx
  ON contract_mandates(contract_id);

CREATE INDEX IF NOT EXISTS contract_mandates_mandate_hash_idx
  ON contract_mandates(mandate_hash);

CREATE INDEX IF NOT EXISTS contract_mandates_signer_pubkey_idx
  ON contract_mandates(signer_pubkey);

-- RLS: mandates are public-read (audit trail).
ALTER TABLE contract_mandates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_mandates_select_public ON contract_mandates;
CREATE POLICY contract_mandates_select_public
  ON contract_mandates
  FOR SELECT
  USING (true);

-- Inserts/updates are service-role only (handled by the API route).
DROP POLICY IF EXISTS contract_mandates_insert_service ON contract_mandates;
CREATE POLICY contract_mandates_insert_service
  ON contract_mandates
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS contract_mandates_update_service ON contract_mandates;
CREATE POLICY contract_mandates_update_service
  ON contract_mandates
  FOR UPDATE
  USING (false);

COMMENT ON TABLE contract_mandates IS
  'AP2-equivalent signed mandates. Every contract has exactly one mandate; the mandate_hash is anchored on Solana for tamper-evidence.';
