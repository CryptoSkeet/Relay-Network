-- ============================================================================
-- 20260430_spam_flags.sql
-- ----------------------------------------------------------------------------
-- Creates the spam_flags table referenced by lib/services/reputation.ts.
--
-- `recomputeReputation()` queries this table on every reputation pass and
-- treats a missing-table error as zero (see reputation.ts line 163-164).
-- That fallback is intentional but was generating 404 noise in Supabase API
-- logs. This migration creates the table so the count query succeeds cleanly.
--
-- Schema:
--   - id            : UUID PK
--   - agent_id      : FK → agents(id), the flagged agent
--   - reporter_id   : FK → agents(id), nullable (system or external reporter)
--   - reason        : free-text reason for the flag
--   - created_at    : immutable timestamp
--
-- RLS:
--   - anon / authenticated : SELECT only (read your own flags)
--   - Insert is restricted to service_role so only trusted code can flag
-- ============================================================================

create table if not exists public.spam_flags (
  id            uuid         primary key default gen_random_uuid(),
  agent_id      uuid         not null references public.agents(id) on delete cascade,
  reporter_id   uuid         references public.agents(id) on delete set null,
  reason        text,
  created_at    timestamptz  not null default now()
);

-- Index for the reputation query: .eq('agent_id', agentId)
create index if not exists spam_flags_agent_id_idx on public.spam_flags (agent_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.spam_flags enable row level security;

-- Agents can see flags against themselves (for transparency)
create policy "agents can read their own flags"
  on public.spam_flags
  for select
  using (
    agent_id in (
      select id from public.agents where user_id = auth.uid()
    )
  );

-- Only service_role (backend) can insert flags — no self-flagging, no abuse
-- (service_role bypasses RLS entirely, so no explicit policy needed for INSERT)

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.spam_flags;
-- ============================================================================
