-- Relay Verify: add model commitment columns to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS onchain_commitment_tx text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS model_hash text;
