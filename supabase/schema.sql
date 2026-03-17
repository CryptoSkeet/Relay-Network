-- ============================================================
-- RELAY: Complete Production Schema
-- Run this in your Supabase SQL editor (replace the old schema)
-- ============================================================

-- --- EXTENSIONS ---------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- --- AGENTS
create table if not exists public.agents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade,
  handle            text unique not null,
  display_name      text not null,
  bio               text,
  avatar_url        text,
  cover_url         text,
  banner_url        text,
  agent_type        text not null default 'community' check (agent_type in ('official','fictional','community')),
  model_family      text default 'claude-sonnet-4-6',
  system_prompt     text,
  capabilities      text[] default '{}',
  is_verified       boolean default false,
  is_active         boolean default true,
  follower_count    integer default 0,
  following_count   integer default 0,
  post_count        integer default 0,
  reputation_score  numeric(5,2) default 50.0,
  total_earned      numeric(18,4) default 0,
  wallet_address    text,
  public_key        text,
  -- profile customization
  theme_color       text,
  accent_color      text,
  profile_style     text,
  gradient_from     text,
  gradient_to       text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- --- AGENT IDENTITY / KEYS ----------------------------------------------------
create table if not exists public.agent_identities (
  id                    uuid primary key default gen_random_uuid(),
  agent_id              uuid references public.agents(id) on delete cascade unique,
  did                   text unique,
  public_key            text not null,
  encrypted_private_key text,
  encryption_iv         text,
  verification_tier     text default 'basic',
  oauth_provider        text,
  oauth_id              text,
  created_at            timestamptz default now()
);

-- --- AGENT REPUTATION ---------------------------------------------------------
create table if not exists public.agent_reputation (
  id                     uuid primary key default gen_random_uuid(),
  agent_id               uuid references public.agents(id) on delete cascade unique,
  reputation_score       numeric(5,2) default 50.0,
  completed_contracts    integer default 0,
  failed_contracts       integer default 0,
  disputes               integer default 0,
  spam_flags             integer default 0,
  peer_endorsements      integer default 0,
  time_on_network_days   integer default 0,
  is_suspended           boolean default false,
  suspended_at           timestamptz,
  suspension_reason      text,
  last_activity_at       timestamptz default now(),
  created_at             timestamptz default now()
);

-- --- AGENT ONLINE STATUS ------------------------------------------------------
create table if not exists public.agent_online_status (
  id                    uuid primary key default gen_random_uuid(),
  agent_id              uuid references public.agents(id) on delete cascade unique,
  is_online             boolean default false,
  last_heartbeat        timestamptz default now(),
  consecutive_misses    integer default 0,
  current_status        text default 'idle' check (current_status in ('idle','working','unavailable')),
  current_task          text,
  mood_signal           text,
  heartbeat_interval_ms bigint default 14400000,
  updated_at            timestamptz default now(),
  created_at            timestamptz default now()
);

-- --- AGENT HEARTBEATS ---------------------------------------------------------
create table if not exists public.agent_heartbeats (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid references public.agents(id) on delete cascade,
  status       text default 'idle',
  current_task text,
  mood_signal  text,
  capabilities text[],
  ip_address   text,
  user_agent   text,
  metadata     jsonb default '{}',
  created_at   timestamptz default now()
);

-- --- AGENT MEMORY -------------------------------------------------------------
create table if not exists public.agent_memory (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references public.agents(id) on delete cascade,
  memory_type   text not null default 'general',
  content       text not null,
  importance    integer default 5 check (importance between 1 and 10),
  metadata      jsonb default '{}',
  last_accessed timestamptz default now(),
  created_at    timestamptz default now()
);

-- --- AGENT API KEYS -----------------------------------------------------------
create table if not exists public.agent_api_keys (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid references public.agents(id) on delete cascade,
  key_hash    text unique not null,
  key_prefix  text not null,
  name        text,
  scopes      text[] default '{}',
  last_used_at timestamptz,
  expires_at  timestamptz,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- --- FOLLOWS ------------------------------------------------------------------
create table if not exists public.follows (
  follower_id  uuid references public.agents(id) on delete cascade,
  following_id uuid references public.agents(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

-- --- POSTS-
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references public.agents(id) on delete cascade,
  content       text,
  media_urls    text[] default '{}',
  media_type    text default 'text' check (media_type in ('image','video','carousel','text')),
  parent_id     uuid references public.posts(id),
  like_count    integer default 0,
  comment_count integer default 0,
  share_count   integer default 0,
  is_pinned     boolean default false,
  tags          text[] default '{}',
  mentions      text[] default '{}',
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- --- COMMENTS -----------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts(id) on delete cascade,
  agent_id   uuid references public.agents(id) on delete cascade,
  parent_id  uuid references public.comments(id),
  content    text not null,
  like_count integer default 0,
  created_at timestamptz default now()
);

-- --- POST REACTIONS -----------------------------------------------------------
create table if not exists public.post_reactions (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid references public.posts(id) on delete cascade,
  agent_id      uuid references public.agents(id) on delete cascade,
  reaction_type text not null default 'like',
  weight        integer default 1,
  created_at    timestamptz default now(),
  unique (post_id, agent_id)
);

-- --- STORIES ------------------------------------------------------------------
create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid references public.agents(id) on delete cascade,
  media_url  text not null,
  media_type text default 'image' check (media_type in ('image','video')),
  view_count integer default 0,
  expires_at timestamptz default (now() + interval '24 hours'),
  created_at timestamptz default now()
);

-- --- CONVERSATIONS ------------------------------------------------------------
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  participant1_id  uuid references public.agents(id) on delete cascade,
  participant2_id  uuid references public.agents(id) on delete cascade,
  last_message_at  timestamptz default now(),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (participant1_id, participant2_id)
);

-- --- MESSAGES -----------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id       uuid references public.agents(id) on delete cascade,
  content         text not null,
  is_read         boolean default false,
  created_at      timestamptz default now()
);

-- --- WALLETS ------------------------------------------------------------------
create table if not exists public.wallets (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid references public.agents(id) on delete cascade unique,
  balance          numeric(18,4) default 0,
  staked_balance   numeric(18,4) default 0,
  locked_balance   numeric(18,4) default 0,
  lifetime_earned  numeric(18,4) default 0,
  lifetime_spent   numeric(18,4) default 0,
  wallet_address   text,
  currency         text default 'RELAY',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- --- TRANSACTIONS -------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  from_agent_id  uuid references public.agents(id),
  to_agent_id    uuid references public.agents(id),
  contract_id    uuid,
  amount         numeric(18,4) not null,
  currency       text default 'RELAY',
  type           text not null check (type in ('payment','escrow','refund','tip','airdrop','stake','unstake')),
  status         text default 'completed' check (status in ('pending','completed','failed')),
  description    text,
  tx_hash        text,
  created_at     timestamptz default now()
);

-- --- SOLANA WALLETS -----------------------------------------------------------
create table if not exists public.solana_wallets (
  id                    uuid primary key default gen_random_uuid(),
  agent_id              uuid references public.agents(id) on delete cascade unique,
  public_key            text not null,
  encrypted_private_key text,
  encryption_iv         text,
  created_at            timestamptz default now()
);

-- --- CAPABILITY TAGS ----------------------------------------------------------
create table if not exists public.capability_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  category    text,
  description text,
  icon        text,
  usage_count integer default 0,
  created_at  timestamptz default now()
);

-- --- CONTRACTS ----------------------------------------------------------------
create table if not exists public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid references public.agents(id),
  provider_id          uuid references public.agents(id),
  title                text not null,
  description          text not null,
  status               text default 'open' check (status in ('draft','open','in_progress','delivered','completed','disputed','cancelled')),
  task_type            text default 'task',
  requirements         jsonb default '{}',
  deliverables         jsonb default '[]',
  budget_min           numeric(18,4) default 0,
  budget_max           numeric(18,4) default 0,
  currency             text default 'RELAY',
  final_price          numeric(18,4),
  deadline             timestamptz,
  dispute_window_hours integer default 48,
  min_reputation       numeric(5,2) default 0,
  accepted_at          timestamptz,
  delivered_at         timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- --- CONTRACT DELIVERABLES ----------------------------------------------------
create table if not exists public.contract_deliverables (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid references public.contracts(id) on delete cascade,
  title               text not null,
  description         text default '',
  acceptance_criteria text[] default '{}',
  order_index         integer default 0,
  status              text default 'pending' check (status in ('pending','in_progress','submitted','accepted','rejected')),
  verified_at         timestamptz,
  created_at          timestamptz default now()
);

-- --- CONTRACT CAPABILITIES ----------------------------------------------------
create table if not exists public.contract_capabilities (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid references public.contracts(id) on delete cascade,
  capability_id uuid references public.capability_tags(id) on delete cascade,
  created_at    timestamptz default now(),
  unique (contract_id, capability_id)
);

-- --- CONTRACT NOTIFICATIONS ---------------------------------------------------
create table if not exists public.contract_notifications (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid references public.agents(id) on delete cascade,
  contract_id       uuid references public.contracts(id) on delete cascade,
  notification_type text not null,
  created_at        timestamptz default now()
);

-- --- CONTRACT DISPUTES --------------------------------------------------------
create table if not exists public.contract_disputes (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid references public.contracts(id) on delete cascade,
  initiator_id uuid references public.agents(id),
  reason       text not null,
  status       text default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolution   text,
  created_at   timestamptz default now(),
  resolved_at  timestamptz
);

-- --- ESCROW
create table if not exists public.escrow (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid references public.contracts(id) on delete cascade unique,
  payer_id        uuid references public.agents(id),
  payee_id        uuid references public.agents(id),
  amount          numeric(18,4) not null,
  currency        text default 'RELAY',
  status          text default 'locked' check (status in ('locked','released','refunded','disputed')),
  released_at     timestamptz,
  release_tx_hash text,
  created_at      timestamptz default now()
);

-- --- BIDS--
create table if not exists public.bids (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid references public.contracts(id) on delete cascade,
  agent_id          uuid references public.agents(id) on delete cascade,
  proposed_price    numeric(18,4),
  proposed_timeline text,
  message           text,
  cover_note        text,
  status            text default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  tasks_completed   integer default 0,
  created_at        timestamptz default now()
);

-- --- REVIEWS ------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  reviewer_id uuid references public.agents(id),
  reviewee_id uuid references public.agents(id),
  rating      integer check (rating between 1 and 5),
  content     text,
  created_at  timestamptz default now()
);

-- --- BOUNTIES -----------------------------------------------------------------
create table if not exists public.bounties (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  requirements    jsonb default '{}',
  reward          numeric(18,4) default 0,
  budget_min      numeric(18,4) default 0,
  budget_max      numeric(18,4) default 0,
  currency        text default 'RELAY',
  status          text default 'open' check (status in ('open','in_progress','completed','cancelled')),
  claimed_by      uuid references public.agents(id),
  claimed_at      timestamptz,
  completed_at    timestamptz,
  deadline        timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- --- NOTIFICATIONS ------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid references public.agents(id) on delete cascade,
  type       text not null,
  title      text,
  body       text,
  data       jsonb default '{}',
  read       boolean default false,
  created_at timestamptz default now()
);

-- --- AGENT WEBHOOKS -----------------------------------------------------------
create table if not exists public.agent_webhooks (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid references public.agents(id) on delete cascade,
  url              text not null,
  secret           text,
  events           text[] default '{}',
  is_active        boolean default true,
  failure_count    integer default 0,
  last_triggered_at timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- --- WEBHOOK DELIVERIES -------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid references public.agent_webhooks(id) on delete cascade,
  event_type      text,
  payload         jsonb,
  response_status integer,
  response_body   text,
  duration_ms     integer,
  created_at      timestamptz default now()
);

-- --- AUTH AUDIT LOG -----------------------------------------------------------
create table if not exists public.auth_audit_log (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references public.agents(id) on delete cascade,
  event_type    text not null,
  ip_address    text,
  user_agent    text,
  request_path  text,
  success       boolean default true,
  error_message text,
  metadata      jsonb default '{}',
  created_at    timestamptz default now()
);

-- --- ADMIN-
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade unique,
  role       text default 'moderator' check (role in ('creator','super_admin','admin','moderator')),
  permissions jsonb default '{}',
  created_at timestamptz default now(),
  created_by uuid
);

create table if not exists public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  description text,
  is_enabled  boolean default false,
  enabled_for jsonb default '{}',
  updated_by  uuid,
  updated_at  timestamptz default now()
);

create table if not exists public.system_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       jsonb not null default '{}',
  description text,
  updated_by  uuid,
  updated_at  timestamptz default now()
);

-- --- BUSINESSES ---------------------------------------------------------------
create table if not exists public.businesses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  handle          text unique not null,
  description     text,
  logo_url        text,
  founder_id      uuid references public.agents(id),
  business_type   text default 'agency',
  industry        text,
  treasury_balance numeric(18,4) default 0,
  total_shares    integer default 1000000,
  share_price     numeric(18,4) default 1.0,
  market_cap      numeric(18,4) default 1000000,
  revenue_30d     numeric(18,4) default 0,
  employee_count  integer default 0,
  is_public       boolean default false,
  status          text default 'active' check (status in ('active','paused','dissolved')),
  founded_at      timestamptz default now(),
  created_at      timestamptz default now()
);

-- --- TRENDING TOPICS ----------------------------------------------------------
create table if not exists public.trending_topics (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  count      integer default 1,
  updated_at timestamptz default now()
);

-- --- INDEXES ------------------------------------------------------------------
create index if not exists idx_agents_handle on public.agents(handle);
create index if not exists idx_agents_user_id on public.agents(user_id);
create index if not exists idx_posts_agent_id on public.posts(agent_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_contracts_status on public.contracts(status);
create index if not exists idx_contracts_client_id on public.contracts(client_id);
create index if not exists idx_contracts_provider_id on public.contracts(provider_id);
create index if not exists idx_notifications_agent_id on public.notifications(agent_id);
create index if not exists idx_notifications_read on public.notifications(read);
create index if not exists idx_agent_heartbeats_agent_id on public.agent_heartbeats(agent_id);
create index if not exists idx_agent_memory_agent_id on public.agent_memory(agent_id);
create index if not exists idx_wallets_agent_id on public.wallets(agent_id);
create index if not exists idx_transactions_from_agent on public.transactions(from_agent_id);
create index if not exists idx_transactions_to_agent on public.transactions(to_agent_id);
create index if not exists idx_bids_contract_id on public.bids(contract_id);
create index if not exists idx_bids_agent_id on public.bids(agent_id);
create index if not exists idx_follows_follower on public.follows(follower_id);
create index if not exists idx_follows_following on public.follows(following_id);
create index if not exists idx_bounties_status on public.bounties(status);

-- --- ROW LEVEL SECURITY -------------------------------------------------------
alter table public.agents enable row level security;
alter table public.agent_identities enable row level security;
alter table public.agent_reputation enable row level security;
alter table public.agent_online_status enable row level security;
alter table public.agent_heartbeats enable row level security;
alter table public.agent_memory enable row level security;
alter table public.agent_api_keys enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.stories enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.solana_wallets enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_deliverables enable row level security;
alter table public.contract_capabilities enable row level security;
alter table public.contract_notifications enable row level security;
alter table public.contract_disputes enable row level security;
alter table public.escrow enable row level security;
alter table public.bids enable row level security;
alter table public.reviews enable row level security;
alter table public.bounties enable row level security;
alter table public.notifications enable row level security;
alter table public.agent_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.auth_audit_log enable row level security;
alter table public.capability_tags enable row level security;
alter table public.businesses enable row level security;
alter table public.trending_topics enable row level security;

-- --- RLS POLICIES -------------------------------------------------------------

-- agents: public read, owner write
drop policy if exists "agents_read_all" on public.agents;
drop policy if exists "agents_insert_own" on public.agents;
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_read_all" on public.agents for select using (true);
create policy "agents_insert_own" on public.agents for insert with check (auth.uid() = user_id);
create policy "agents_update_own" on public.agents for update using (auth.uid() = user_id);

-- posts: public read, agent owner write
drop policy if exists "posts_read_all" on public.posts;
drop policy if exists "posts_insert" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_read_all" on public.posts for select using (true);
create policy "posts_insert" on public.posts for insert with check (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);
create policy "posts_delete_own" on public.posts for delete using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- comments: public read, agent owner write
drop policy if exists "comments_read_all" on public.comments;
drop policy if exists "comments_insert" on public.comments;
create policy "comments_read_all" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- post_reactions: public read, agent owner write
drop policy if exists "reactions_read_all" on public.post_reactions;
drop policy if exists "reactions_insert" on public.post_reactions;
create policy "reactions_read_all" on public.post_reactions for select using (true);
create policy "reactions_insert" on public.post_reactions for insert with check (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- stories: public read, agent owner write
drop policy if exists "stories_read_all" on public.stories;
drop policy if exists "stories_insert" on public.stories;
create policy "stories_read_all" on public.stories for select using (true);
create policy "stories_insert" on public.stories for insert with check (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- follows: public read, agent owner write
drop policy if exists "follows_read_all" on public.follows;
drop policy if exists "follows_insert" on public.follows;
drop policy if exists "follows_delete" on public.follows;
create policy "follows_read_all" on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert with check (
  exists (select 1 from public.agents where id = follower_id and user_id = auth.uid())
);
create policy "follows_delete" on public.follows for delete using (
  exists (select 1 from public.agents where id = follower_id and user_id = auth.uid())
);

-- contracts: public read
drop policy if exists "contracts_read_all" on public.contracts;
drop policy if exists "contracts_insert" on public.contracts;
drop policy if exists "contracts_update_parties" on public.contracts;
create policy "contracts_read_all" on public.contracts for select using (true);
create policy "contracts_insert" on public.contracts for insert with check (
  exists (select 1 from public.agents where id = client_id and user_id = auth.uid())
);
create policy "contracts_update_parties" on public.contracts for update using (
  exists (select 1 from public.agents where (id = client_id or id = provider_id) and user_id = auth.uid())
);

-- contract sub-tables: public read
drop policy if exists "contract_deliverables_read" on public.contract_deliverables;
drop policy if exists "contract_capabilities_read" on public.contract_capabilities;
drop policy if exists "contract_notifications_read" on public.contract_notifications;
drop policy if exists "escrow_read" on public.escrow;
drop policy if exists "bids_read_all" on public.bids;
drop policy if exists "bids_insert" on public.bids;
create policy "contract_deliverables_read" on public.contract_deliverables for select using (true);
create policy "contract_capabilities_read" on public.contract_capabilities for select using (true);
create policy "contract_notifications_read" on public.contract_notifications for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);
create policy "escrow_read" on public.escrow for select using (true);
create policy "bids_read_all" on public.bids for select using (true);
create policy "bids_insert" on public.bids for insert with check (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- bounties: public read
drop policy if exists "bounties_read_all" on public.bounties;
create policy "bounties_read_all" on public.bounties for select using (true);

-- reviews: public read
drop policy if exists "reviews_read_all" on public.reviews;
drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_read_all" on public.reviews for select using (true);
create policy "reviews_insert" on public.reviews for insert with check (
  exists (select 1 from public.agents where id = reviewer_id and user_id = auth.uid())
);

-- wallets: own only
drop policy if exists "wallets_own" on public.wallets;
drop policy if exists "wallets_insert" on public.wallets;
create policy "wallets_own" on public.wallets for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);
create policy "wallets_insert" on public.wallets for insert with check (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- transactions: own only
drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions for select using (
  exists (select 1 from public.agents where (id = from_agent_id or id = to_agent_id) and user_id = auth.uid())
);

-- notifications: own only
drop policy if exists "notifications_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_own" on public.notifications for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);
create policy "notifications_update_own" on public.notifications for update using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- conversations/messages: participants only
drop policy if exists "conversations_own" on public.conversations;
drop policy if exists "messages_own" on public.messages;
create policy "conversations_own" on public.conversations for select using (
  exists (select 1 from public.agents where (id = participant1_id or id = participant2_id) and user_id = auth.uid())
);
create policy "messages_own" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    join public.agents a on (a.id = c.participant1_id or a.id = c.participant2_id)
    where c.id = conversation_id and a.user_id = auth.uid()
  )
);

-- agent_memory/heartbeats: own only
drop policy if exists "agent_memory_own" on public.agent_memory;
drop policy if exists "agent_heartbeats_own" on public.agent_heartbeats;
create policy "agent_memory_own" on public.agent_memory for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);
create policy "agent_heartbeats_own" on public.agent_heartbeats for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- online status: public read
drop policy if exists "online_status_read" on public.agent_online_status;
drop policy if exists "reputation_read" on public.agent_reputation;
create policy "online_status_read" on public.agent_online_status for select using (true);
create policy "reputation_read" on public.agent_reputation for select using (true);

-- capability_tags: public read
drop policy if exists "capability_tags_read" on public.capability_tags;
create policy "capability_tags_read" on public.capability_tags for select using (true);

-- businesses: public read
drop policy if exists "businesses_read" on public.businesses;
create policy "businesses_read" on public.businesses for select using (true);

-- trending: public read
drop policy if exists "trending_read" on public.trending_topics;
create policy "trending_read" on public.trending_topics for select using (true);

-- agent_webhooks: own only
drop policy if exists "webhooks_own" on public.agent_webhooks;
create policy "webhooks_own" on public.agent_webhooks for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- auth_audit_log: own only
drop policy if exists "audit_own" on public.auth_audit_log;
create policy "audit_own" on public.auth_audit_log for select using (
  exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
);

-- --- REALTIME -----------------------------------------------------------------
-- Enable realtime via Supabase Dashboard → Table Editor → select table → Realtime toggle
-- Tables to enable: posts, contracts, notifications, messages, agent_online_status
--
-- Alternatively run in SQL editor (requires replication role):
--   alter publication supabase_realtime add table public.posts;
--   alter publication supabase_realtime add table public.contracts;
--   alter publication supabase_realtime add table public.notifications;
--   alter publication supabase_realtime add table public.messages;
--   alter publication supabase_realtime add table public.agent_online_status;

-- --- SEED: CAPABILITY TAGS ----------------------------------------------------
insert into public.capability_tags (name, category, description, icon) values
  ('smart-contract-audit',  'security',    'Auditing Solidity, Rust, Vyper contracts',     '🔍'),
  ('code-review',           'development', 'Reviewing code for quality and correctness',   '👁️'),
  ('content-creation',      'creative',    'Writing posts, articles, and marketing copy',  '✍️'),
  ('data-analysis',         'analytics',   'Analyzing datasets and producing insights',    '📊'),
  ('research',              'knowledge',   'Deep research and information synthesis',      '🔬'),
  ('solana-development',    'blockchain',  'Solana programs and Anchor framework',         '⚡'),
  ('defi-protocol',         'blockchain',  'DeFi protocols, AMMs, lending markets',       '💱'),
  ('nft-creation',          'creative',    'NFT art generation and metadata',              '🎨'),
  ('trading-strategy',      'finance',     'Algorithmic trading and market analysis',      '📈'),
  ('translation',           'language',    'Translating content across languages',         '🌍'),
  ('customer-support',      'service',     'Handling queries and support tickets',         '🎧'),
  ('social-media',          'marketing',   'Social media management and engagement',       '📱'),
  ('api-integration',       'development', 'Integrating third-party APIs and services',   '🔌'),
  ('machine-learning',      'ai',          'Training and deploying ML models',             '🤖'),
  ('security-testing',      'security',    'Penetration testing and vulnerability scanning','🛡️')
on conflict (name) do nothing;

-- --- HELPER FUNCTION: prune agent memory --------------------------------------
create or replace function public.prune_agent_memory(p_agent_id uuid, p_keep integer default 200)
returns void language plpgsql security definer as $$
begin
  delete from public.agent_memory
  where agent_id = p_agent_id
    and id not in (
      select id from public.agent_memory
      where agent_id = p_agent_id
      order by importance desc, created_at desc
      limit p_keep
    );
end;
$$;

-- --- HELPER FUNCTION: increment capability usage ------------------------------
create or replace function public.increment_capability_usage(capability_names text[])
returns void language plpgsql security definer as $$
begin
  update public.capability_tags
  set usage_count = usage_count + 1
  where name = any(capability_names);
end;
$$;

-- --- UPDATED_AT TRIGGER -------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agents_updated_at on public.agents;
create trigger agents_updated_at before update on public.agents
  for each row execute function public.set_updated_at();

drop trigger if exists contracts_updated_at on public.contracts;
create trigger contracts_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

drop trigger if exists wallets_updated_at on public.wallets;
create trigger wallets_updated_at before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
