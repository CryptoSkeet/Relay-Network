-- supabase/migrations/20260403_external_agents.sql

-- External agent registry
create table if not exists external_agents (
  id                uuid primary key default gen_random_uuid(),

  -- Identity
  relay_did         text unique not null,  -- did:relay:external:{slug}
  external_id       text,                  -- their ID on source registry
  source_registry   text not null,         -- 'use-agently' | 'agentverse' | 'mcp-registry'
  source_url        text not null,         -- their profile URL on source

  -- Profile
  name              text not null,
  description       text,
  capabilities      text[] default '{}',
  avatar_url        text,

  -- Payment
  x402_enabled      boolean default false,
  evm_address       text,                  -- their public EVM address for claim verification
  solana_address    text,                  -- their Solana address if available
  mcp_endpoint      text,                  -- MCP server URL if available

  -- Relay reputation (starts at 0, grows with each completed contract)
  reputation_score  integer default 0,
  contracts_completed integer default 0,
  total_value_relay numeric(18,6) default 0,

  -- Claim status
  status            text default 'unclaimed', -- 'unclaimed' | 'claimed' | 'verified'
  claimed_agent_id  uuid references agents(id), -- set when claimed
  claimed_at        timestamptz,
  claim_tx_hash     text,

  -- Custody (Relay holds DID keypair until claimed)
  custodial_public_key  text,
  custodial_private_key text,  -- encrypted, transferred to agent on claim

  -- Meta
  last_indexed_at   timestamptz default now(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Reputation events log
create table if not exists external_agent_reputation_events (
  id                uuid primary key default gen_random_uuid(),
  external_agent_id uuid references external_agents(id) on delete cascade,
  contract_id       uuid,
  event_type        text not null,  -- 'contract_completed' | 'contract_failed' | 'claimed'
  reputation_delta  integer not null,
  new_score         integer not null,
  metadata          jsonb default '{}',
  created_at        timestamptz default now()
);

-- RLS
alter table external_agents enable row level security;
alter table external_agent_reputation_events enable row level security;

-- Anyone can read external agents (public directory)
create policy "external agents are public"
  on external_agents for select using (true);

-- Only service role can insert/update (done by indexer)
-- No user-facing insert policy needed

-- Reputation events are public read
create policy "reputation events are public"
  on external_agent_reputation_events for select using (true);

-- Indexes
create index if not exists external_agents_source_registry_idx on external_agents(source_registry);
create index if not exists external_agents_status_idx on external_agents(status);
create index if not exists external_agents_reputation_idx on external_agents(reputation_score desc);
create index if not exists external_agents_evm_idx on external_agents(evm_address);
create index if not exists external_agent_rep_events_agent_idx on external_agent_reputation_events(external_agent_id);
