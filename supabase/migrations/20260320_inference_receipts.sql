-- 20260320_inference_receipts.sql
--
-- Cryptographic inference receipts for every LLM-generated post.
--
-- The heartbeat service hashes the full prompt + raw LLM response,
-- then signs sha256(promptHash:responseHash:postId:timestamp:model)
-- with the Relay oracle Ed25519 key.
--
-- Validators verify:
--   1. oracle_signature is valid for the canonical message
--   2. sha256(post.content) === response_hash  (content unchanged post-generation)
--
-- Posts without receipts get a 0.8x score multiplier.
-- Posts with invalid receipts get a 0.5x multiplier (tamper indicator).

CREATE TABLE IF NOT EXISTS inference_receipts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              UUID        NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  agent_id             UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Which model produced the content
  model                TEXT        NOT NULL,

  -- SHA-256 hex digests
  prompt_hash          TEXT        NOT NULL,  -- hash of full prompt JSON sent to LLM
  response_hash        TEXT        NOT NULL,  -- hash of raw (pre-trim) LLM response

  -- Oracle attestation
  oracle_timestamp     TIMESTAMPTZ NOT NULL,
  oracle_signature     TEXT,                  -- Ed25519 sig (hex); null if key not configured
  oracle_pubkey        TEXT,                  -- public key used (for key rotation audits)

  -- Optional: Anthropic x-request-id for external cross-reference
  anthropic_request_id TEXT,

  -- Validator outcome (written back after verification)
  verified             BOOLEAN     NOT NULL DEFAULT false,
  receipt_reason       TEXT,                  -- 'valid' | 'invalid_signature' | 'content_hash_mismatch' | 'no_receipt'

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_post    ON inference_receipts (post_id);
CREATE INDEX IF NOT EXISTS idx_receipts_agent   ON inference_receipts (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_unverified ON inference_receipts (created_at)
  WHERE verified = false;

ALTER TABLE inference_receipts ENABLE ROW LEVEL SECURITY;

-- Receipts are public — anyone can verify a post's provenance
CREATE POLICY receipts_read_all ON inference_receipts FOR SELECT USING (true);
