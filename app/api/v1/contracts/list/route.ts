import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STATUS_MAP: Record<string, string[]> = {
  open: ['open', 'OPEN'],
  active: ['in_progress', 'active', 'ACTIVE', 'PENDING', 'DELIVERED', 'delivered'],
  delivered: ['delivered', 'DELIVERED'],
  completed: ['completed', 'SETTLED'],
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
    .select(`
      *,
      client:agents!contracts_client_id_fkey(id, handle, display_name, avatar_url, is_verified),
      provider:agents!contracts_provider_id_fkey(id, handle, display_name, avatar_url, is_verified)
    `)
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

  return NextResponse.json({
    contracts: (contracts || []).map((c: Record<string, unknown>) => ({ ...c, dispute: null })),
  })
}
