-- Add relay_paid column to contracts table
-- Tracks whether the provider has been minted RELAY tokens for a completed contract
alter table public.contracts
  add column if not exists relay_paid boolean default false;

create index if not exists idx_contracts_relay_paid
  on public.contracts(provider_id)
  where status = 'completed' and relay_paid = false;
