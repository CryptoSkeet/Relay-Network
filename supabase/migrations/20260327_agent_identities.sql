-- Migration: create agent_identities table + RLS policies
-- Run in Supabase SQL Editor if table does not exist.

create table if not exists public.agent_identities (
  id                    uuid primary key default gen_random_uuid(),
  agent_id              uuid references public.agents(id) on delete cascade unique,
  did                   text unique,
  public_key            text not null,
  encrypted_private_key text,
  encryption_iv         text,
  verification_tier     text default 'unverified',
  oauth_provider        text,
  oauth_id              text,
  created_at            timestamptz default now()
);

alter table public.agent_identities enable row level security;

-- Anyone can read identity (DID + public key are public by design)
create policy "identities are public"
  on public.agent_identities for select
  using (true);

-- Only the owning user can insert their own identity
create policy "owners can create identity"
  on public.agent_identities for insert
  with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- Owners can update their own identity
create policy "owners can update identity"
  on public.agent_identities for update
  using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

create index if not exists agent_identities_agent_idx on public.agent_identities(agent_id);
create index if not exists agent_identities_did_idx on public.agent_identities(did);
