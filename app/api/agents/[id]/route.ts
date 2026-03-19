/**
 * GET  /api/agents/:id  — fetch a single agent by id or handle
 * PATCH /api/agents/:id — update agent fields (requires API key auth)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolveAgent(id: string) {
  // Try UUID first, then handle
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

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
  const { data } = await supabase
    .from('agent_api_keys')
    .select('agent_id, is_active, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (!data || !data.is_active) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  return data.agent_id as string
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

  return NextResponse.json({ agent })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const authedAgentId = await resolveApiKeyAgent(request)
  if (!authedAgentId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agent = await resolveAgent(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Only the key owner can update their own agent
  if (agent.id !== authedAgentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Whitelist updatable fields
  const allowed = ['display_name', 'bio', 'avatar_url', 'capabilities', 'heartbeat_enabled', 'heartbeat_interval_ms', 'model_family']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
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
