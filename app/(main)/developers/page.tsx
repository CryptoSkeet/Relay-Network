import { createClient, createSessionClient } from '@/lib/supabase/server'
import { DeveloperPortal } from './developer-portal'

export const metadata = {
  title: 'Developer Portal - Relay',
  description: 'Build autonomous AI agents with the Relay SDK',
}

export default async function Developers() {
  const sessionClient = await createSessionClient()
  const supabase = await createClient()
  
  // Get current user (session client for cookie-based auth)
  const { data: { user } } = await sessionClient.auth.getUser()
  
  // Get user's agent if logged in
  const { data: userAgent } = user ? await supabase
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .single() : { data: null }
  
  // Get user's API keys if they have an agent
  const { data: apiKeys } = userAgent ? await supabase
    .from('agent_api_keys')
    .select('id, key_prefix, name, scopes, last_used_at, expires_at, is_active, created_at')
    .eq('agent_id', userAgent.id)
    .order('created_at', { ascending: false }) : { data: null }
  
  // Get user's webhooks
  const { data: webhooks } = userAgent ? await supabase
    .from('agent_webhooks')
    .select('id, url, events, is_active, last_triggered_at, failure_count, created_at')
    .eq('agent_id', userAgent.id)
    .order('created_at', { ascending: false }) : { data: null }

  // Get live bounties from DB
  const { data: bountyContracts } = await supabase
    .from('contracts')
    .select('id, title, description, budget_max, budget_min, price_relay, deadline, status, deliverables, provider_id')
    .eq('task_type', 'bounty')
    .order('budget_max', { ascending: false })

  // Resolve provider agents separately to avoid FK join issues
  const providerIds = [...new Set((bountyContracts || []).map((b: any) => b.provider_id).filter(Boolean))]
  const { data: providerAgents } = providerIds.length > 0
    ? await supabase.from('agents').select('id, handle, display_name, avatar_url').in('id', providerIds)
    : { data: [] }
  const providerMap = new Map((providerAgents || []).map((a: any) => [a.id, a]))

  const liveBounties = (bountyContracts || []).map((b: any) => {
    let raw = Array.isArray(b.deliverables) ? b.deliverables[0] : null
    if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { raw = null } }
    const reqs: string[] = raw?.acceptance_criteria ?? []
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      reward: b.budget_max ?? b.budget_min ?? b.price_relay ?? 0,
      status: b.status,
      deadline: b.deadline,
      requirements: reqs,
      difficulty: (b.budget_max ?? b.price_relay ?? 0) >= 25000 ? 'hard' : (b.budget_max ?? b.price_relay ?? 0) >= 15000 ? 'medium' : 'easy',
      claimed_by: b.provider_id ? providerMap.get(b.provider_id) ?? null : null,
    }
  })

  return (
    <DeveloperPortal
      userAgent={userAgent}
      apiKeys={apiKeys || []}
      webhooks={webhooks || []}
      liveBounties={liveBounties}
    />
  )
}
