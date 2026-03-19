-- ============================================================
-- Migration: contract-engine schema support
-- Adds engine-style columns to contracts and creates escrow_holds
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Add engine columns to contracts
--    (buyer/seller aliases, price_relay, deadline_hours, new timestamps)
-- ---------------------------------------------------------------------------

alter table public.contracts
  add column if not exists seller_agent_id   uuid references public.agents(id),
  add column if not exists buyer_agent_id    uuid references public.agents(id),
  add column if not exists seller_wallet     text,
  add column if not exists buyer_wallet      text,
  add column if not exists price_relay       numeric(18,4),
  add column if not exists deadline_hours    integer default 24,
  add column if not exists deliverable_type  text default 'custom',
  add column if not exists deliverable       jsonb,
  add column if not exists eval_deadline     timestamptz,
  add column if not exists buyer_requirements jsonb,
  add column if not exists seller_message    text,
  add column if not exists escrow_id         uuid,
  add column if not exists initiated_at      timestamptz,
  add column if not exists settled_at        timestamptz,
  add column if not exists cancelled_at      timestamptz,
  add column if not exists cancel_reason     text,
  add column if not exists buyer_rating     smallint check (buyer_rating between 1 and 5),
  add column if not exists buyer_feedback   text;

-- ---------------------------------------------------------------------------
-- 2. Widen the status check to include engine states (uppercase)
--    Drop old constraint first, add new one covering both naming conventions
-- ---------------------------------------------------------------------------

alter table public.contracts
  drop constraint if exists contracts_status_check;

alter table public.contracts
  add constraint contracts_status_check check (status in (
    -- legacy lowercase values (existing routes)
    'draft', 'open', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled',
    -- engine uppercase values (contract-engine.js)
    'OPEN', 'PENDING', 'ACTIVE', 'DELIVERED', 'SETTLED', 'DISPUTED', 'CANCELLED'
  ));

-- ---------------------------------------------------------------------------
-- 3. Backfill seller_agent_id / buyer_agent_id from existing rows
-- ---------------------------------------------------------------------------

update public.contracts
  set seller_agent_id = provider_id
  where provider_id is not null and seller_agent_id is null;

update public.contracts
  set buyer_agent_id = client_id
  where client_id is not null and buyer_agent_id is null;

-- ---------------------------------------------------------------------------
-- 4. Create escrow_holds table
--    Separate from the existing `escrow` table — engine uses escrow_holds
-- ---------------------------------------------------------------------------

create table if not exists public.escrow_holds (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid references public.contracts(id) on delete cascade,
  buyer_agent_id   uuid references public.agents(id),
  buyer_wallet     text,
  amount_relay     numeric(18,4) not null,
  status           text default 'LOCKED' check (status in ('LOCKED', 'RELEASED', 'REFUNDED', 'DISPUTED')),
  locked_at        timestamptz default now(),
  released_at      timestamptz,
  created_at       timestamptz default now()
);

create index if not exists escrow_holds_contract_id_idx on public.escrow_holds(contract_id);
create index if not exists escrow_holds_buyer_agent_id_idx on public.escrow_holds(buyer_agent_id);

-- RLS
alter table public.escrow_holds enable row level security;

drop policy if exists "escrow_holds_read" on public.escrow_holds;
create policy "escrow_holds_read" on public.escrow_holds
  for select using (true);

-- ---------------------------------------------------------------------------
-- 5. Add foreign key from contracts.escrow_id → escrow_holds.id
--    (deferred — escrow_holds must exist first)
-- ---------------------------------------------------------------------------

alter table public.contracts
  drop constraint if exists contracts_escrow_id_fkey;

alter table public.contracts
  add constraint contracts_escrow_id_fkey
  foreign key (escrow_id) references public.escrow_holds(id)
  deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- 6. credit_relay_reward RPC (called by settleContract — non-fatal if missing)
--    Creates or replaces the function so the engine can call it
-- ---------------------------------------------------------------------------

create or replace function public.credit_relay_reward(
  p_agent_id    uuid,
  p_amount      numeric,
  p_contract_id uuid
) returns void
language plpgsql
security definer
as $$
begin
  -- Credit the agent's wallet balance
  update public.wallets
    set balance        = balance + p_amount,
        lifetime_earned = lifetime_earned + p_amount
    where agent_id = p_agent_id;

  -- Record the transaction
  insert into public.transactions (
    from_agent_id, to_agent_id, contract_id, amount, currency, type, status, description
  ) values (
    null,
    p_agent_id,
    p_contract_id,
    p_amount,
    'RELAY',
    'contract_payment',
    'completed',
    'Contract settlement payout'
  );
end;
$$;
