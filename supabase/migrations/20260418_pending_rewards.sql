-- ============================================================================
-- 20260418_pending_rewards.sql
-- ----------------------------------------------------------------------------
-- Pending rewards ledger.
--
-- Tracks RELAY rewards that have been earned but not yet claimed by a
-- recipient (typically because the recipient hasn't connected a wallet, or
-- is a passive contributor like a GitHub bounty author).
--
-- This is the off-chain accounting primitive. Settlement remains:
--   * If the beneficiary has a wallet (agent.solana_wallet_address): mint or
--     transfer RELAY directly. No row in this table.
--   * Otherwise: write a row here. When the beneficiary later claims via
--     /api/rewards/claim, the rows are summed, RELAY is minted to the
--     destination wallet, and rows are marked claimed.
--
-- Beneficiary identification — exactly ONE must be set per row:
--   * beneficiary_agent_id          — internal Relay agent
--   * beneficiary_external_agent_id — indexed external_agents row
--   * beneficiary_did               — DID string when no DB row yet exists
-- ============================================================================

create table if not exists pending_rewards (
  id                            uuid primary key default gen_random_uuid(),
  -- Beneficiary discriminators (exactly one set, enforced by check)
  beneficiary_agent_id          uuid references agents(id)          on delete set null,
  beneficiary_external_agent_id uuid references external_agents(id) on delete set null,
  beneficiary_did               text,
  -- Reward
  amount_relay                  numeric(18,6) not null check (amount_relay > 0),
  source_type                   text not null check (source_type in ('contract','bounty','grant','airdrop','referral','other')),
  source_id                     text,                              -- contract_id / bounty_id / external ref
  reason                        text,                              -- human-readable note
  -- Lifecycle
  status                        text not null default 'pending'
                                  check (status in ('pending','claimed','cancelled')),
  created_at                    timestamptz not null default now(),
  claimed_at                    timestamptz,
  cancelled_at                  timestamptz,
  cancel_reason                 text,
  -- Claim record
  claim_destination_wallet      text,
  claim_tx_hash                 text,
  claim_batch_id                uuid,                              -- groups multiple rows claimed in one tx
  metadata                      jsonb not null default '{}'::jsonb,
  -- Exactly one beneficiary must be set
  constraint pending_rewards_one_beneficiary check (
    (
      (beneficiary_agent_id          is not null)::int +
      (beneficiary_external_agent_id is not null)::int +
      (beneficiary_did               is not null)::int
    ) = 1
  )
);

create index if not exists pending_rewards_agent_idx          on pending_rewards(beneficiary_agent_id)          where beneficiary_agent_id          is not null;
create index if not exists pending_rewards_external_agent_idx on pending_rewards(beneficiary_external_agent_id) where beneficiary_external_agent_id is not null;
create index if not exists pending_rewards_did_idx            on pending_rewards(beneficiary_did)               where beneficiary_did               is not null;
create index if not exists pending_rewards_status_idx         on pending_rewards(status);
create index if not exists pending_rewards_source_idx         on pending_rewards(source_type, source_id);
create index if not exists pending_rewards_batch_idx          on pending_rewards(claim_batch_id) where claim_batch_id is not null;

-- Idempotency: prevent accidental duplicate accrual for the same source event.
-- A given (source_type, source_id) per beneficiary can only have one pending row.
create unique index if not exists pending_rewards_source_dedup
  on pending_rewards(
    source_type,
    source_id,
    coalesce(beneficiary_agent_id::text,
             beneficiary_external_agent_id::text,
             beneficiary_did)
  )
  where status = 'pending' and source_id is not null;

alter table pending_rewards enable row level security;

-- Service role: full access
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pending_rewards' and policyname = 'service rw pending rewards') then
    create policy "service rw pending rewards" on pending_rewards
      for all using (auth.role() = 'service_role');
  end if;
end $$;

-- Authenticated users may read pending rewards owed to them via their agents.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pending_rewards' and policyname = 'users read own pending rewards') then
    create policy "users read own pending rewards" on pending_rewards
      for select using (
        beneficiary_agent_id in (
          select id from agents where user_id = auth.uid()
        )
      );
  end if;
end $$;

comment on table pending_rewards is
  'Off-chain ledger of RELAY rewards earned but not yet claimed. Sum across rows = total claimable balance per beneficiary.';
