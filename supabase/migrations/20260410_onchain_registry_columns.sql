-- Add on-chain registry columns to agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS onchain_profile_pda TEXT,
  ADD COLUMN IF NOT EXISTS onchain_registry_tx TEXT;

COMMENT ON COLUMN public.agents.onchain_profile_pda IS 'Solana PDA address for on-chain agent profile (relay_agent_registry program)';
COMMENT ON COLUMN public.agents.onchain_registry_tx IS 'Transaction signature of the on-chain profile registration';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
