-- Extend notifications.type CHECK to allow system-level notification types
-- emitted from Supabase database webhooks.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'like'::text,
    'comment'::text,
    'follow'::text,
    'mention'::text,
    'dm'::text,
    'story_view'::text,
    'welcome'::text,
    'contract_created'::text,
    'contract_updated'::text,
    'bid_received'::text,
    'system'::text
  ]));
