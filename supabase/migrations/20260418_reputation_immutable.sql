-- ============================================================================
-- 20260418_reputation_immutable.sql
-- ----------------------------------------------------------------------------
-- Reputation is a *derived* value, not an admin-mutable field.
--
-- The score is computed atomically by `recomputeReputation()` in
-- `lib/services/reputation.ts` from immutable history (contracts,
-- peer_endorsements, spam_flags). This migration enforces that invariant at
-- the database layer:
--
--   1. A trigger blocks any UPDATE or INSERT on `agent_reputation` that
--      changes scoring fields unless the caller has set the session GUC
--      `relay.reputation_recompute = 'on'`. The recompute helper sets that
--      GUC right before its upsert; nothing else does.
--
--   2. A REVOKE strips column-level UPDATE privileges from the `anon` and
--      `authenticated` roles entirely — even Supabase Studio cannot edit the
--      score directly.
--
-- Net effect: there is no admin path that can hand-edit a reputation score.
-- The only way to change it is to insert/settle a contract or
-- endorsement and let the recompute run.
-- ============================================================================

-- 1. Trigger function ---------------------------------------------------------

create or replace function public.protect_reputation_score()
returns trigger
language plpgsql
as $$
declare
  bypass text;
begin
  -- Allow if the recompute helper has set its session flag
  bypass := current_setting('relay.reputation_recompute', true);
  if bypass = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Allow inserts only if score equals the deterministic starting value.
    -- The recompute helper will overwrite it on first contract/endorsement.
    if new.reputation_score is distinct from 500
       and new.reputation_score is distinct from 0 then
      raise exception
        'reputation_score is derived — set via recomputeReputation(), not directly'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE path: block any change to scoring fields
  if  new.reputation_score      is distinct from old.reputation_score
   or new.completed_contracts   is distinct from old.completed_contracts
   or new.failed_contracts      is distinct from old.failed_contracts
   or new.disputes              is distinct from old.disputes
   or new.spam_flags            is distinct from old.spam_flags
   or new.peer_endorsements     is distinct from old.peer_endorsements
   or new.time_on_network_days  is distinct from old.time_on_network_days
   or new.is_suspended          is distinct from old.is_suspended
   or new.suspended_at          is distinct from old.suspended_at
   or new.suspension_reason     is distinct from old.suspension_reason
  then
    raise exception
      'reputation fields are derived — call recomputeReputation() instead of UPDATE'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 2. Wire the trigger ---------------------------------------------------------

drop trigger if exists trg_protect_reputation_score on public.agent_reputation;

create trigger trg_protect_reputation_score
  before insert or update on public.agent_reputation
  for each row
  execute function public.protect_reputation_score();

-- 3. Revoke direct column UPDATE from non-service roles -----------------------
--    SELECT remains open so the UI can read the projection.
--    INSERT/UPDATE go through the trigger, which gates on the session GUC.
--    The Supabase service_role bypasses RLS but still hits the trigger,
--    so even backend code must use recomputeReputation().

revoke update (
  reputation_score,
  completed_contracts,
  failed_contracts,
  disputes,
  spam_flags,
  peer_endorsements,
  time_on_network_days,
  is_suspended,
  suspended_at,
  suspension_reason
) on public.agent_reputation from anon, authenticated;

-- 4. Allow callers to set the GUC --------------------------------------------
--    `set_config('relay.reputation_recompute', 'on', true)` is the only
--    sanctioned write path. PostgREST exposes this via the `set_config` RPC.
--    No GRANT is needed — set_config is part of the default catalog.
--    Note: the GUC must be declared as a custom class, which Supabase allows
--    for any name containing a dot.

-- ============================================================================
-- Rollback (manual):
--   DROP TRIGGER trg_protect_reputation_score ON public.agent_reputation;
--   DROP FUNCTION public.protect_reputation_score();
--   GRANT UPDATE ON public.agent_reputation TO authenticated;
-- ============================================================================
