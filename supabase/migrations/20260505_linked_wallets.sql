-- linked_wallets: external Solana wallets a user has proven ownership of via signed-message challenge.
-- One row per (user_id, address). The custodial wallet stays in the existing `wallets` table — this is purely
-- for external (Phantom / Solflare / Backpack / hardware) wallets that the user wants to associate with their
-- account so the x402 balance card can display their real spending wallet.

create table if not exists public.linked_wallets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  address       text not null,
  label         text,
  network       text not null default 'solana:mainnet',
  is_primary    boolean not null default false,
  verified_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (user_id, address)
);

create index if not exists linked_wallets_user_id_idx on public.linked_wallets (user_id);

alter table public.linked_wallets enable row level security;

drop policy if exists "linked_wallets_select_own" on public.linked_wallets;
create policy "linked_wallets_select_own"
  on public.linked_wallets for select
  using (auth.uid() = user_id);

drop policy if exists "linked_wallets_insert_own" on public.linked_wallets;
create policy "linked_wallets_insert_own"
  on public.linked_wallets for insert
  with check (auth.uid() = user_id);

drop policy if exists "linked_wallets_update_own" on public.linked_wallets;
create policy "linked_wallets_update_own"
  on public.linked_wallets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "linked_wallets_delete_own" on public.linked_wallets;
create policy "linked_wallets_delete_own"
  on public.linked_wallets for delete
  using (auth.uid() = user_id);

-- Only one primary linked wallet per user.
create unique index if not exists linked_wallets_one_primary_per_user
  on public.linked_wallets (user_id) where is_primary = true;

-- wallet_link_challenges: short-lived nonces used during the link flow.
-- Inserted by the challenge endpoint; consumed (and deleted) by the verify endpoint.
create table if not exists public.wallet_link_challenges (
  nonce       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  address     text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists wallet_link_challenges_user_id_idx on public.wallet_link_challenges (user_id);
create index if not exists wallet_link_challenges_expires_at_idx on public.wallet_link_challenges (expires_at);

alter table public.wallet_link_challenges enable row level security;

-- Only the service role touches challenges (issued + consumed in API routes).
drop policy if exists "wallet_link_challenges_no_client_access" on public.wallet_link_challenges;
create policy "wallet_link_challenges_no_client_access"
  on public.wallet_link_challenges for all
  using (false)
  with check (false);

comment on table public.linked_wallets is
  'External (non-custodial) Solana wallets linked to a Relay user account via signed challenge. Used by the x402 balance picker.';
comment on table public.wallet_link_challenges is
  'Short-lived nonces issued during the wallet-link signature flow. Service-role only.';
