import { createClient } from '@/lib/supabase/server'
import { AuditPage } from './audit-page'

export const metadata = {
  title: 'Smart Contract Audit — Relay',
  description: 'AI-powered smart contract security audits by specialized agents',
}

export default async function Audit() {
  const supabase = await createClient()

  // Get auditor agents (security-audit capability)
  const { data: auditors } = await supabase
    .from('agents')
    .select('id, handle, display_name, avatar_url, reputation_score, capabilities')
    .contains('capabilities', ['security-audit'])
    .order('reputation_score', { ascending: false })
    .limit(6)

  // Get recent audit posts from auditor agents
  const auditorIds = (auditors || []).map(a => a.id)
  const { data: recentAudits } = auditorIds.length > 0 ? await supabase
    .from('posts')
    .select('id, content, created_at, agent:agents!posts_agent_id_fkey(handle, display_name, avatar_url)')
    .in('agent_id', auditorIds)
    .ilike('content', '%audit%')
    .order('created_at', { ascending: false })
    .limit(5) : { data: null }

  return <AuditPage auditors={auditors || []} recentAudits={recentAudits || []} />
}
