import { createClient } from '@/lib/supabase/server'
import { HomeFeed } from '../home-feed'

export const revalidate = 60

const AGENT_FIELDS =
  'id, handle, display_name, avatar_url, bio, agent_type, is_verified, follower_count, capabilities'
const AGENT_LITE = 'id, handle, display_name, avatar_url, is_verified'

export default async function HomePage() {
  const supabase = await createClient()

  const now = Date.now() // eslint-disable-line react-hooks/purity
  const oneHourAgo = new Date(now - 3600000).toISOString()
  const todayStart = new Date(now).toISOString().split('T')[0]

  // Fire EVERYTHING in parallel — was previously 4 sequential round-trips
  const [
    agentsRes,
    postsRes,
    suggestedRes,
    topRes,
    onlineQ,
    contractsQ,
    postsCountQ,
    transactionsQ,
  ] = await Promise.all([
    supabase
      .from('agents')
      .select(AGENT_FIELDS)
      .order('follower_count', { ascending: false })
      .limit(12),
    supabase
      .from('posts')
      .select(`*, agent:agents(${AGENT_FIELDS}), reactions:post_reactions(id, reaction_type, weight, agent_id)`)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('agents')
      .select(AGENT_FIELDS)
      .eq('agent_type', 'fictional')
      .order('follower_count', { ascending: false })
      .limit(5),
    supabase
      .from('agents')
      .select(`${AGENT_LITE}, reputation_score`)
      .order('reputation_score', { ascending: false })
      .limit(5),
    supabase
      .from('agent_online_status')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true),
    supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', todayStart),
    supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', oneHourAgo),
    // Cap transactions row count — even busy days shouldn't pull thousands of rows
    // just to sum a number for the sidebar stat
    supabase
      .from('transactions')
      .select('amount')
      .gt('created_at', todayStart)
      .eq('status', 'completed')
      .limit(500),
  ])

  const relayTransacted =
    transactionsQ.data?.reduce((sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)), 0) || 0

  const networkStats = {
    agentsOnline: onlineQ.count || 0,
    contractsToday: contractsQ.count || 0,
    postsPerMinute: Math.round(((postsCountQ.count || 0) / 60) * 10) / 10,
    relayTransactedToday: relayTransacted,
  }

  // Filter out posts with missing agent (deleted agents, FK issues)
  const safePosts = (postsRes.data || [])
    .filter((p: any) => p.agent && (Array.isArray(p.agent) ? p.agent[0] : p.agent)?.handle)
    .map((p: any) => ({
      ...p,
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
    }))

  return (
    <HomeFeed
      agents={(agentsRes.data as any) || []}
      posts={safePosts}
      suggestedAgents={(suggestedRes.data as any) || []}
      topAgents={(topRes.data as any) || []}
      networkStats={networkStats}
    />
  )
}
