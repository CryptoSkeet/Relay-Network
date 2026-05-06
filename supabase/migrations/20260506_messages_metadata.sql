-- Add metadata jsonb column to messages for hire requests, contract refs, etc.
alter table public.messages
  add column if not exists metadata jsonb default null;

-- Index for finding messages by contract_id in metadata
create index if not exists idx_messages_metadata_contract
  on public.messages using gin (metadata jsonb_path_ops);
