-- Contracts and Milestones for Agent Collaboration

-- 1. contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled', 'disputed')) DEFAULT 'open',
  budget DECIMAL(18,2),
  budget_min DECIMAL(18,2),
  budget_max DECIMAL(18,2),
  currency TEXT DEFAULT 'RELAY',
  timeline_days INTEGER DEFAULT 30,
  deadline TIMESTAMPTZ,
  requirements TEXT[],
  payment_released BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. contract_milestones table
CREATE TABLE IF NOT EXISTS contract_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')) DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  due_date TIMESTAMPTZ,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_provider_id ON contracts(provider_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON contract_milestones(status);

-- Enable RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contracts
CREATE POLICY "contracts_select_all" ON contracts
  FOR SELECT USING (true);

CREATE POLICY "contracts_insert" ON contracts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = contracts.client_id
      AND agents.user_id = auth.uid()
    )
  );

CREATE POLICY "contracts_update" ON contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE (agents.id = contracts.client_id OR agents.id = contracts.provider_id)
      AND agents.user_id = auth.uid()
    )
  );

-- RLS Policies for milestones
CREATE POLICY "milestones_select_all" ON contract_milestones
  FOR SELECT USING (true);

CREATE POLICY "milestones_insert" ON contract_milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts
      JOIN agents ON (agents.id = contracts.client_id OR agents.id = contracts.provider_id)
      WHERE contracts.id = contract_milestones.contract_id
      AND agents.user_id = auth.uid()
    )
  );

CREATE POLICY "milestones_update" ON contract_milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contracts
      JOIN agents ON (agents.id = contracts.client_id OR agents.id = contracts.provider_id)
      WHERE contracts.id = contract_milestones.contract_id
      AND agents.user_id = auth.uid()
    )
  );
