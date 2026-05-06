-- Phase 3: Track reputation score and discount applied per transaction
alter table agent_x402_transactions
  add column if not exists kya_score    integer not null default 0,
  add column if not exists discount_bps integer not null default 0;

comment on column agent_x402_transactions.kya_score    is 'On-chain reputation score (bps 0-10000) at time of transaction';
comment on column agent_x402_transactions.discount_bps is 'Reputation discount applied (bps, e.g. 500 = 5%)';
