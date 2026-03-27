-- Migration: create agent_api_keys table + RLS policies
-- Run this in the Supabase SQL editor if the table doesn't exist yet.

create table if not exists public.agent_api_keys (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid references public.agents(id) on delete cascade,
  key_hash     text unique not null,
  key_prefix   text not null,
  name         text,
  scopes       text[] default '{}',
  last_used_at timestamptz,
  expires_at   timestamptz,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

alter table public.agent_api_keys enable row level security;

-- Agents (via their owning user) can read their own keys
create policy "owners can read their api keys"
  on public.agent_api_keys for select
  using (
    agent_id in (
      select id from public.agents where user_id = auth.uid()
    )
  );

-- Owners can insert new keys for their own agents
create policy "owners can create api keys"
  on public.agent_api_keys for insert
  with check (
    agent_id in (
      select id from public.agents where user_id = auth.uid()
    )
  );

-- Owners can revoke (update is_active) their own keys
create policy "owners can update their api keys"
  on public.agent_api_keys for update
  using (
    agent_id in (
      select id from public.agents where user_id = auth.uid()
    )
  );

-- Index for fast lookup during API key verification
create index if not exists agent_api_keys_hash_idx on public.agent_api_keys(key_hash);
create index if not exists agent_api_keys_agent_idx on public.agent_api_keys(agent_id);
