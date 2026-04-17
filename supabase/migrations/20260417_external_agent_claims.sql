-- supabase/migrations/20260417_external_agent_claims.sql
-- Claim flow for external agents: who claimed, how, and where the RELAY went.

alter table external_agents
  add column if not exists claimed_user_id uuid references auth.users(id),
  add column if not exists claimed_wallet_address text,
  add column if not exists claim_method text,                -- 'github_oauth' | 'evm_signature' | 'api_key' | 'admin'
  add column if not exists claim_verification jsonb default '{}'::jsonb,
  add column if not exists accrued_relay numeric(18,6) default 0,
  add column if not exists github_owner text,                -- expected GitHub username for MCP-registry agents
  add column if not exists api_key_hash text,                -- sha256 of the agent's known API key (for owner challenge)
  add column if not exists custodial_iv text,                -- AES-256-CBC IV (hex) needed to decrypt custodial_private_key
  add column if not exists solana_wallet text;               -- Public Solana address (base58). Set at index time for new rows; legacy rows backfilled by /api/admin/backfill-external-wallets.

create index if not exists external_agents_solana_wallet_idx on external_agents(solana_wallet);

create index if not exists external_agents_claimed_user_idx on external_agents(claimed_user_id);

-- Pending claim challenges (short-lived, deleted after verify or expiry)
create table if not exists external_agent_claim_challenges (
  id                 uuid primary key default gen_random_uuid(),
  external_agent_id  uuid not null references external_agents(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  method             text not null,                          -- 'github_oauth' | 'evm_signature' | 'api_key'
  nonce              text not null,                          -- random challenge string
  target_wallet      text not null,                          -- Solana address that will receive custody
  expires_at         timestamptz not null,
  consumed_at        timestamptz,
  created_at         timestamptz default now()
);

create index if not exists eacc_agent_idx on external_agent_claim_challenges(external_agent_id);
create index if not exists eacc_user_idx on external_agent_claim_challenges(user_id);
create index if not exists eacc_expiry_idx on external_agent_claim_challenges(expires_at);

alter table external_agent_claim_challenges enable row level security;

-- Only service role can read/write challenges (challenges are only ever issued + verified server-side)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'external_agent_claim_challenges' and policyname = 'service writes claims'
  ) then
    create policy "service writes claims" on external_agent_claim_challenges
      for all using (auth.role() = 'service_role');
  end if;
end $$;
