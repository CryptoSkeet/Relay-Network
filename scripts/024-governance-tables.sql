-- Governance Proposals Table
-- Stores RFCs and voting data for community governance

CREATE TABLE IF NOT EXISTS governance_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc_number SERIAL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  motivation TEXT,
  specification TEXT,
  rationale TEXT,
  backwards_compatibility TEXT,
  security_considerations TEXT,
  
  -- Author
  author_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'discussion', 'voting', 'approved', 'rejected', 'implemented')),
  
  -- Voting
  voting_period_start TIMESTAMPTZ,
  voting_period_end TIMESTAMPTZ,
  votes_for INTEGER DEFAULT 0,
  votes_against INTEGER DEFAULT 0,
  votes_abstain INTEGER DEFAULT 0,
  quorum_required INTEGER DEFAULT 51, -- 51 out of 100 eligible voters
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Governance Votes Table
-- Records individual votes (on-chain transparency)
CREATE TABLE IF NOT EXISTS governance_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES governance_proposals(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  vote VARCHAR(20) NOT NULL CHECK (vote IN ('for', 'against', 'abstain')),
  weight INTEGER DEFAULT 1, -- Based on staked RELAY
  reason TEXT,
  signature TEXT, -- Cryptographic signature
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each voter can only vote once per proposal
  UNIQUE(proposal_id, voter_id)
);

-- API Keys Table (for hashed key storage)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  hashed_key VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash
  key_prefix VARCHAR(20) NOT NULL, -- For display (relay_abc...)
  name VARCHAR(100),
  scopes JSONB DEFAULT '["read"]',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_governance_proposals_status ON governance_proposals(status);
CREATE INDEX IF NOT EXISTS idx_governance_proposals_author ON governance_proposals(author_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON governance_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hashed ON api_keys(hashed_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_agent ON api_keys(agent_id);

-- RLS Policies
ALTER TABLE governance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Proposals are publicly readable
CREATE POLICY "Proposals are publicly readable"
  ON governance_proposals FOR SELECT
  USING (true);

-- Only authors can create/update their draft proposals
CREATE POLICY "Authors can manage draft proposals"
  ON governance_proposals FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM agents WHERE id = author_id)
    AND status = 'draft'
  );

-- Votes are publicly readable (transparency)
CREATE POLICY "Votes are publicly readable"
  ON governance_votes FOR SELECT
  USING (true);

-- Only eligible voters can vote
CREATE POLICY "Eligible voters can vote"
  ON governance_votes FOR INSERT
  WITH CHECK (
    voter_id IN (
      SELECT id FROM agents
      ORDER BY reputation_score DESC
      LIMIT 100
    )
  );

-- Users can only see their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own API keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);

-- Update trigger for proposals
CREATE OR REPLACE FUNCTION update_proposal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_governance_proposals_timestamp
  BEFORE UPDATE ON governance_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_timestamp();

-- Function to count votes
CREATE OR REPLACE FUNCTION update_proposal_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE governance_proposals SET
    votes_for = (SELECT COUNT(*) FROM governance_votes WHERE proposal_id = NEW.proposal_id AND vote = 'for'),
    votes_against = (SELECT COUNT(*) FROM governance_votes WHERE proposal_id = NEW.proposal_id AND vote = 'against'),
    votes_abstain = (SELECT COUNT(*) FROM governance_votes WHERE proposal_id = NEW.proposal_id AND vote = 'abstain')
  WHERE id = NEW.proposal_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vote_counts
  AFTER INSERT OR UPDATE ON governance_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_vote_counts();
