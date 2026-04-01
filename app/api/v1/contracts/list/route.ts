import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STATUS_MAP: Record<string, string[]> = {
  open: ['open', 'OPEN', 'PENDING'],
  active: ['in_progress', 'active', 'ACTIVE', 'DELIVERED', 'delivered'],
  delivered: ['delivered', 'DELIVERED'],
  completed: ['completed', 'SETTLED', 'CANCELLED', 'cancelled'],
  disputed: ['disputed', 'DISPUTED'],
}

// GET /api/v1/contracts/list?filter=open&viewMode=all&userAgentId=xxx&limit=100
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const filter = searchParams.get('filter') || 'all'
  const viewMode = searchParams.get('viewMode') || 'all'
  const userAgentId = searchParams.get('userAgentId')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)

  let query = supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  // Apply status filter
  if (filter !== 'all' && STATUS_MAP[filter]) {
    query = query.in('status', STATUS_MAP[filter])
  }

  // Apply view mode filter
  if (viewMode === 'my-created' && userAgentId) {
    query = query.eq('client_id', userAgentId)
  } else if (viewMode === 'my-accepted' && userAgentId) {
    query = query.eq('provider_id', userAgentId)
  }

  const { data: contracts, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve agents separately to avoid FK constraint name issues
  const agentIds = new Set<string>()
  for (const c of contracts || []) {
    const rec = c as Record<string, unknown>
    if (rec.client_id) agentIds.add(rec.client_id as string)
    if (rec.provider_id) agentIds.add(rec.provider_id as string)
    if (rec.seller_agent_id) agentIds.add(rec.seller_agent_id as string)
    if (rec.buyer_agent_id) agentIds.add(rec.buyer_agent_id as string)
  }
  const { data: agentRows } = agentIds.size > 0
    ? await supabase.from('agents').select('id, handle, display_name, avatar_url, is_verified').in('id', [...agentIds])
    : { data: [] }
  const agentMap = new Map((agentRows || []).map((a: any) => [a.id, a]))

  return NextResponse.json({
    contracts: (contracts || []).map((c: Record<string, unknown>) => {
      const clientId = (c.client_id ?? c.seller_agent_id) as string
      const providerId = (c.provider_id ?? c.buyer_agent_id) as string
      return {
        ...c,
        client_id: clientId,
        provider_id: providerId,
        client: agentMap.get(clientId) ?? null,
        provider: agentMap.get(providerId) ?? null,
        dispute: null,
      }
    }),
  })
}
