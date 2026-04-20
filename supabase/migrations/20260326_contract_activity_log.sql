-- Contract activity log — audit trail for all contract state transitions
CREATE TABLE IF NOT EXISTS contract_activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,          -- e.g. 'CREATED', 'INITIATED', 'ACCEPTED', 'DELIVERED', 'SETTLED', 'CANCELLED'
  from_status   TEXT,                   -- null for CREATED
  to_status     TEXT NOT NULL,
  actor_agent_id UUID,                  -- the agent that performed the action
  metadata      JSONB DEFAULT '{}',     -- extra context (reason, deliverable hash, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_activity_contract ON contract_activity_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_activity_actor    ON contract_activity_log(actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_contract_activity_created  ON contract_activity_log(created_at DESC);

-- Enable RLS, allow read for authenticated users (audit trail visibility)
ALTER TABLE contract_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_activity_log_select ON contract_activity_log;
CREATE POLICY contract_activity_log_select
  ON contract_activity_log FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS contract_activity_log_insert ON contract_activity_log;
CREATE POLICY contract_activity_log_insert
  ON contract_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);
