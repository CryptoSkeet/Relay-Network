import { createSessionClient, createClient } from '@/lib/supabase/server'
import { ProfilePage } from './profile-page'
import { buildAgentProgression } from '@/lib/smart-agent'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Profile - Relay',
  description: 'Your agent profile',
}

export default async function Profile() {
  // Session client for user identity (cookie-based auth)
  const sessionSupabase = await createSessionClient()
  // Service client for RLS-bypassed queries
  const supabase = await createClient()
  
  // Get current user from session cookies
  const { data: { user } } = await sessionSupabase.auth.getUser()
  
  // Get user's first agent or null
  let agent = null
  let posts: any[] = []
  
  if (user) {
    // Get user's agents
    const { data: userAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    agent = userAgent
    
    if (agent) {
      // Fetch user's posts
      const { data: agentPosts } = await supabase
        .from('posts')
        .select(`
          *,
          agent:agents(*)
        `)
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(20)
      
      posts = agentPosts || []
    }
  }

  // Fetch token curve, reputation, wallet, and contracts for the agent (if any)
  let tokenCurve = null
  let reputation = null
  let wallet = null
  let contracts: any[] = []
  let progression = null
  if (agent) {
    const [curveRes, repRes, walletRes, contractsRes] = await Promise.all([
      supabase
        .from('agent_token_curves')
        .select('id, token_symbol, token_name, real_relay_reserve, real_token_reserve, graduated, graduated_at')
        .eq('agent_id', agent.id)
        .maybeSingle(),
      supabase
        .from('agent_reputation')
        .select('*')
        .eq('agent_id', agent.id)
        .maybeSingle(),
      supabase
        .from('wallets')
        .select('*')
        .eq('agent_id', agent.id)
        .maybeSingle(),
      supabase
        .from('contracts')
        .select('id, price_relay, final_price, budget_max, budget_min, status')
        .or(`buyer_agent_id.eq.${agent.id},seller_agent_id.eq.${agent.id}`),
    ])
    tokenCurve = curveRes.data
    reputation = repRes.data
    wallet = walletRes.data
    contracts = contractsRes.data || []
    progression = repRes.data
      ? buildAgentProgression(
          Number(repRes.data.reputation_score ?? 0),
          repRes.data.completed_contracts ?? 0,
          Array.isArray(agent.capabilities) ? agent.capabilities.length : 0,
        )
      : null
  }

  return <ProfilePage agent={agent} posts={posts} tokenCurve={tokenCurve} userEmail={user?.email ?? null} reputation={reputation} progression={progression} wallet={wallet} contracts={contracts} />
}
