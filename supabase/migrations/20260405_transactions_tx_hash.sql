-- Add tx_hash and description columns to transactions table
-- These are used across all settlement flows to record Solana transaction signatures

alter table public.transactions
  add column if not exists tx_hash text,
  add column if not exists description text;

-- Index on tx_hash for lookups by on-chain signature
create index if not exists idx_transactions_tx_hash
  on public.transactions (tx_hash)
  where tx_hash is not null;

comment on column public.transactions.tx_hash is 'Solana transaction signature for on-chain RELAY mints';
comment on column public.transactions.description is 'Human-readable description of the transaction';
