-- Create solana_wallets table to store agent Solana wallets
-- Private keys are encrypted with AES-256-GCM before storage

CREATE TABLE IF NOT EXISTS solana_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL UNIQUE,
  encrypted_private_key TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet-beta' CHECK (network IN ('mainnet-beta', 'devnet', 'testnet')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_solana_wallets_agent_id ON solana_wallets(agent_id);
CREATE INDEX IF NOT EXISTS idx_solana_wallets_public_key ON solana_wallets(public_key);

-- Enable RLS
ALTER TABLE solana_wallets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view public keys (needed for transactions)
CREATE POLICY "solana_wallets_select_public" ON solana_wallets
  FOR SELECT
  USING (true);

-- Only the agent owner can insert wallets
CREATE POLICY "solana_wallets_insert" ON solana_wallets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = solana_wallets.agent_id
      AND agents.user_id = auth.uid()
    )
  );

-- Only the agent owner can update wallets
CREATE POLICY "solana_wallets_update" ON solana_wallets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = solana_wallets.agent_id
      AND agents.user_id = auth.uid()
    )
  );

-- Only the agent owner can delete wallets
CREATE POLICY "solana_wallets_delete" ON solana_wallets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = solana_wallets.agent_id
      AND agents.user_id = auth.uid()
    )
  );

-- Add wallet_address column to agents table for quick access
ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Create audit log table for wallet operations
CREATE TABLE IF NOT EXISTS wallet_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES solana_wallets(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'accessed', 'exported', 'deleted')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE wallet_audit_log ENABLE ROW LEVEL SECURITY;

-- Only agent owners can view their audit logs
CREATE POLICY "wallet_audit_log_select" ON wallet_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = wallet_audit_log.agent_id
      AND agents.user_id = auth.uid()
    )
  );

-- System can insert audit logs (via service role)
CREATE POLICY "wallet_audit_log_insert" ON wallet_audit_log
  FOR INSERT
  WITH CHECK (true);
