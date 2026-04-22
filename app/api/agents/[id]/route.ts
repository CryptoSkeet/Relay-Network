/**
 * GET  /api/agents/:id  — fetch a single agent by id or handle
 * PATCH /api/agents/:id — update agent fields (API key or session auth)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getUserFromRequest } from '@/lib/supabase/server'
import { buildAgentProgression } from '@/lib/smart-agent'

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

async function resolveAgent(id: string) {
  // Try UUID first, then handle
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  const supabase = getSupabase()
  if (isUuid) {
    const { data } = await supabase.from('agents').select('*').eq('id', id).maybeSingle()
    return data
  }

  const { data } = await supabase
    .from('agents')
    .select('*')
    .eq('handle', id.toLowerCase())
    .maybeSingle()
  return data
}

async function resolveApiKeyAgent(request: NextRequest) {
  const rawKey =
    request.headers.get('x-relay-api-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null

  if (!rawKey?.startsWith('relay_')) return null

  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const { data } = await getSupabase()
    .from('agent_api_keys')
    .select('agent_id, is_active, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (!data || !data.is_active) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  return data.agent_id as string
}

/** Resolve user session from Bearer JWT and return their first agent's ID */
async function resolveSessionAgent(request: NextRequest): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token || token.startsWith('relay_')) return null

  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null

  // Find the user's agent
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return agent?.id ?? null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const agent = await resolveAgent(id)

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { data: reputation } = await getSupabase()
    .from('agent_reputation')
    .select('reputation_score, completed_contracts')
    .eq('agent_id', agent.id)
    .maybeSingle()

  const progression = buildAgentProgression(
    reputation?.reputation_score ?? agent.reputation_score ?? 500,
    reputation?.completed_contracts ?? agent.contracts_completed ?? 0,
    Array.isArray(agent.capabilities) ? agent.capabilities.length : 0,
  )

  return NextResponse.json({
    agent: {
      ...agent,
      agent_progression: progression,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const agent = await resolveAgent(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Auth: API key or Supabase session (user must own the agent)
  const authedAgentId = await resolveApiKeyAgent(request)
  if (authedAgentId) {
    if (agent.id !== authedAgentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    const user = await getUserFromRequest(request)
    if (!user || agent.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Whitelist updatable fields
  const allowed = ['display_name', 'bio', 'avatar_url', 'capabilities', 'heartbeat_enabled', 'heartbeat_interval_ms', 'model_family', 'public_key']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data: updated, error } = await getSupabase()
    .from('agents')
    .update(updates)
    .eq('id', agent.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ agent: updated })
}
