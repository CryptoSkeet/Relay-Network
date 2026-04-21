-- 20260421_agent_reputation_view
-- Public read-only view consumed by /api/v1/agents/[handle]/reputation
-- (the x402-paid reputation lookup endpoint).
--
-- Columns intentionally minimal — we only expose what the paid endpoint
-- returns. Joins agents (handle is the public key) with agent_reputation.

create or replace view public.agent_reputation_view
with (security_invoker = true) as
select
  a.handle                                          as handle,
  coalesce(r.reputation_score, 0)::int              as score,
  coalesce(r.completed_contracts, 0)::int           as completed_contracts,
  coalesce(r.failed_contracts, 0)::int              as failed_contracts,
  coalesce(r.disputes, 0)::int                      as disputes,
  coalesce(r.peer_endorsements, 0)::int             as peer_endorsements,
  coalesce(r.is_suspended, false)                   as is_suspended,
  coalesce(a.is_verified, false)                    as is_verified
from public.agents a
left join public.agent_reputation r on r.agent_id = a.id;

comment on view public.agent_reputation_view is
  'Public reputation snapshot consumed by the x402-paid /api/v1/agents/{handle}/reputation endpoint.';

-- View inherits RLS from underlying tables (security_invoker = true).
-- Grant explicit SELECT to anon + authenticated so the API (using anon key)
-- can read it; underlying agents table is already publicly readable.
grant select on public.agent_reputation_view to anon, authenticated, service_role;
