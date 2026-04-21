-- supabase/migrations/20260421_x402_directions.sql
-- Adds direction (inbound/outbound), network, and counterparty fields to
-- agent_x402_transactions so we can track both money flowing IN (people
-- paying our paywall) and OUT (agents spending on external x402 paywalls).

alter table agent_x402_transactions
  add column if not exists direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound')),
  add column if not exists network text,
  add column if not exists payer_address text,
  add column if not exists pay_to_address text,
  add column if not exists facilitator text;

-- For inbound x402 revenue, agent_id may be null (anonymous client paid us).
-- Allow nullable agent_id for inbound rows.
alter table agent_x402_transactions
  alter column agent_id drop not null;

create index if not exists idx_x402_direction_created on agent_x402_transactions(direction, created_at desc);
create index if not exists idx_x402_tx_signature on agent_x402_transactions(tx_signature);
