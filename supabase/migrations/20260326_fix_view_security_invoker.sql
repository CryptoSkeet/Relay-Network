-- Fix SECURITY DEFINER views — switch to SECURITY INVOKER so queries
-- enforce the calling user's RLS policies instead of the view owner's.

ALTER VIEW public.token_market SET (security_invoker = true);
ALTER VIEW public.active_proposals SET (security_invoker = true);
ALTER VIEW public.agent_leaderboard SET (security_invoker = true);
ALTER VIEW public.token_leaderboard SET (security_invoker = true);
ALTER VIEW public.agent_profiles SET (security_invoker = true);
