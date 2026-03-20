-- 20260320_agent_dao.sql
--
-- Agent DAO governance tables.
-- Token holders vote on changes to their agent's configuration.

-- ---------------------------------------------------------------------------
-- dao_proposals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dao_proposals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  proposer_wallet  TEXT        NOT NULL,

  type             TEXT        NOT NULL
                               CHECK (type IN (
                                 'UPDATE_PERSONALITY', 'UPDATE_HEARTBEAT',
                                 'UPDATE_MODEL', 'UPDATE_FEE_SPLIT'
                               )),
  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  payload          JSONB       NOT NULL DEFAULT '{}',

  status           TEXT        NOT NULL DEFAULT 'ACTIVE'
                               CHECK (status IN ('ACTIVE', 'PASSED', 'FAILED')),

  -- Live vote tallies (updated atomically via dao_increment_vote RPC)
  votes_yes        NUMERIC(20,6) NOT NULL DEFAULT 0,
  votes_no         NUMERIC(20,6) NOT NULL DEFAULT 0,

  -- Execution metadata
  voting_ends_at   TIMESTAMPTZ NOT NULL,
  executed_at      TIMESTAMPTZ,
  quorum_met       BOOLEAN,
  final_yes        NUMERIC(20,6),
  final_no         NUMERIC(20,6),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_agent  ON dao_proposals (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_active ON dao_proposals (voting_ends_at)
  WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- dao_votes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dao_votes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID        NOT NULL REFERENCES dao_proposals(id) ON DELETE CASCADE,
  voter_wallet  TEXT        NOT NULL,
  vote          TEXT        NOT NULL CHECK (vote IN ('YES', 'NO')),
  voting_power  NUMERIC(20,6) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (proposal_id, voter_wallet)  -- one vote per wallet per proposal
);

CREATE INDEX IF NOT EXISTS idx_votes_proposal ON dao_votes (proposal_id);
CREATE INDEX IF NOT EXISTS idx_votes_wallet   ON dao_votes (voter_wallet);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE dao_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dao_votes     ENABLE ROW LEVEL SECURITY;

CREATE POLICY dao_proposals_read_all ON dao_proposals FOR SELECT USING (true);
CREATE POLICY dao_votes_read_all     ON dao_votes     FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- RPC: dao_increment_vote
-- Atomically increments votes_yes or votes_no on a proposal.
-- Avoids read-modify-write races when multiple voters submit concurrently.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dao_increment_vote(
  p_proposal_id UUID,
  p_field       TEXT,
  p_amount      NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_field = 'votes_yes' THEN
    UPDATE dao_proposals SET votes_yes = votes_yes + p_amount WHERE id = p_proposal_id;
  ELSIF p_field = 'votes_no' THEN
    UPDATE dao_proposals SET votes_no  = votes_no  + p_amount WHERE id = p_proposal_id;
  ELSE
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;
END;
$$;
