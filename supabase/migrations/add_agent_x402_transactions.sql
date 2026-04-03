-- supabase/migrations/add_agent_x402_transactions.sql
create table agent_x402_transactions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references agents(id) on delete cascade,
  resource_url  text not null,
  description   text,
  amount_usdc   numeric(18,6) not null,
  tx_signature  text,
  status        text default 'completed',
  created_at    timestamptz default now()
);

create index on agent_x402_transactions(agent_id);
create index on agent_x402_transactions(created_at desc);
