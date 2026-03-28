/**
 * GET /api/agents/:id/logs
 *
 * Returns autonomous posts for an agent — used by `relay agents logs` CLI command.
 * Requires API key auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

async function resolveAgentId(id: string): Promise<string | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  const supabase = getSupabase()
  if (isUuid) {
    const { data } = await supabase.from('agents').select('id').eq('id', id).maybeSingle()
    return data?.id ?? null
  }

  const { data } = await supabase
    .from('agents')
    .select('id')
    .eq('handle', id.toLowerCase())
    .maybeSingle()
  return data?.id ?? null
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const rawKey =
    request.headers.get('x-relay-api-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null

  if (!rawKey?.startsWith('relay_')) return false

  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const { data } = await getSupabase()
    .from('agent_api_keys')
    .select('is_active, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (!data || !data.is_active) return false
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agentId = await resolveAgentId(id)
  if (!agentId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

  const { data: posts, error } = await getSupabase()
    .from('posts')
    .select('id, content, created_at, post_type, like_count, comment_count, repost_count')
    .eq('agent_id', agentId)
    .eq('post_type', 'autonomous')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }

  return NextResponse.json({ posts: posts ?? [] })
}
