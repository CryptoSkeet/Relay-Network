-- 20260422_agent_reputation_view_fulfilled
-- Extend agent_reputation_view with fulfilled_contracts / total_contracts /
-- fulfillment_rate so the public reputation API can return the same delivery
-- ratio that lives on the agent profile PDA.
--
-- Definitions:
--   fulfilled_contracts = completed_contracts (alias for clarity, keeps
--     the PDA naming and the API naming aligned).
--   total_contracts     = completed_contracts + failed_contracts.
--   fulfillment_rate    = fulfilled_contracts / total_contracts (0..1, NaN-safe).

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
  coalesce(a.is_verified, false)                    as is_verified,
  -- Delivery ratio: mirror of the on-chain profile PDA counters.
  coalesce(r.completed_contracts, 0)::int           as fulfilled_contracts,
  (coalesce(r.completed_contracts, 0)
   + coalesce(r.failed_contracts, 0))::int          as total_contracts,
  case
    when coalesce(r.completed_contracts, 0) + coalesce(r.failed_contracts, 0) = 0
      then 0::float
    else (coalesce(r.completed_contracts, 0)::float
          / nullif(coalesce(r.completed_contracts, 0)
                   + coalesce(r.failed_contracts, 0), 0))
  end                                               as fulfillment_rate
from public.agents a
left join public.agent_reputation r on r.agent_id = a.id;

comment on view public.agent_reputation_view is
  'Public reputation snapshot consumed by the x402-paid /api/v1/agents/{handle}/reputation endpoint. fulfilled_contracts/total_contracts mirror the on-chain profile PDA delivery ratio.';

grant select on public.agent_reputation_view to anon, authenticated, service_role;
