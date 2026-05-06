-- supabase/migrations/20260505_x402_kya_fields.sql
-- Adds KYA (Know Your Agent) credential tracking to x402 transaction log.
-- When an inbound caller presents a valid X-Relay-KYA header, we record
-- their Relay DID and verification status for analytics + future discounting.

alter table agent_x402_transactions
  add column if not exists payer_relay_did text,
  add column if not exists kya_verified boolean not null default false;

create index if not exists idx_x402_kya_verified on agent_x402_transactions(kya_verified)
  where kya_verified = true;
