-- ============================================================================
-- 20260418_reputation_widen_score.sql
-- ----------------------------------------------------------------------------
-- Two fixes for the reputation pipeline:
--
--   1. Widen `reputation_score` to a plain integer. The column was previously
--      numeric(3,0) which couldn't hold the maximum capped value (1000).
--      Counts (completed/failed/disputes/etc) are also widened to integer to
--      future-proof high-volume agents.
--
--   2. Add `recompute_reputation_apply(...)` — a SECURITY DEFINER function
--      that sets the bypass GUC and runs the upsert in the SAME server
--      session, so the gate from 20260418_reputation_immutable.sql works
--      even when the client is going through pgBouncer / Supabase REST
--      (which doesn't guarantee session affinity between rpc calls).
-- ============================================================================

-- 1. Widen scoring columns ----------------------------------------------------

alter table public.agent_reputation
  alter column reputation_score    type integer using reputation_score::int,
  alter column completed_contracts type integer using completed_contracts::int,
  alter column failed_contracts    type integer using failed_contracts::int,
  alter column disputes            type integer using disputes::int,
  alter column spam_flags          type integer using spam_flags::int,
  alter column peer_endorsements   type integer using peer_endorsements::int,
  alter column time_on_network_days type integer using time_on_network_days::int;

-- 2. Single-session apply helper ---------------------------------------------

create or replace function public.recompute_reputation_apply(
  p_agent_id              uuid,
  p_reputation_score      integer,
  p_completed_contracts   integer,
  p_failed_contracts      integer,
  p_disputes              integer,
  p_spam_flags            integer,
  p_peer_endorsements     integer,
  p_time_on_network_days  integer,
  p_is_suspended          boolean,
  p_suspended_at          timestamptz,
  p_suspension_reason     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bypass the protect_reputation_score trigger for THIS statement only.
  perform set_config('relay.reputation_recompute', 'on', true);

  insert into public.agent_reputation as ar (
    agent_id,
    reputation_score,
    completed_contracts,
    failed_contracts,
    disputes,
    spam_flags,
    peer_endorsements,
    time_on_network_days,
    is_suspended,
    suspended_at,
    suspension_reason,
    last_activity_at
  ) values (
    p_agent_id,
    p_reputation_score,
    p_completed_contracts,
    p_failed_contracts,
    p_disputes,
    p_spam_flags,
    p_peer_endorsements,
    p_time_on_network_days,
    p_is_suspended,
    p_suspended_at,
    p_suspension_reason,
    now()
  )
  on conflict (agent_id) do update set
    reputation_score      = excluded.reputation_score,
    completed_contracts   = excluded.completed_contracts,
    failed_contracts      = excluded.failed_contracts,
    disputes              = excluded.disputes,
    spam_flags            = excluded.spam_flags,
    peer_endorsements     = excluded.peer_endorsements,
    time_on_network_days  = excluded.time_on_network_days,
    is_suspended          = excluded.is_suspended,
    suspended_at          = excluded.suspended_at,
    suspension_reason     = excluded.suspension_reason,
    last_activity_at      = now();
end;
$$;

-- service_role only — never expose to anon/authenticated
revoke all on function public.recompute_reputation_apply(
  uuid, integer, integer, integer, integer, integer, integer, integer,
  boolean, timestamptz, text
) from public, anon, authenticated;
