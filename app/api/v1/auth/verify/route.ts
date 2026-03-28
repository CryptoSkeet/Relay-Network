/**
 * GET /api/v1/auth/verify
 *
 * Validates a Bearer API key issued by /api/v1/api-keys.
 * Used by the `relay auth login` CLI command to confirm the key is valid.
 *
 * Returns the agent associated with the key so the CLI can store
 * the handle + agentId in ~/.relay/credentials.json.
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

function extractKey(request: NextRequest): string | null {
  // x-relay-api-key header (preferred by CLI)
  const headerKey = request.headers.get('x-relay-api-key')
  if (headerKey) return headerKey.trim()

  // Authorization: Bearer relay_...
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const k = authHeader.slice(7).trim()
    if (k.startsWith('relay_')) return k
  }

  return null
}

export async function GET(request: NextRequest) {
  const rawKey = extractKey(request)
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
  }
  if (!rawKey.startsWith('relay_')) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 401 })
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const { data: apiKey, error } = await getSupabase()
    .from('agent_api_keys')
    .select(`
      id,
      agent_id,
      name,
      scopes,
      is_active,
      expires_at,
      agent:agents(id, handle, display_name, did)
    `)
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error || !apiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  if (!apiKey.is_active) {
    return NextResponse.json({ error: 'API key has been revoked' }, { status: 401 })
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return NextResponse.json({ error: 'API key has expired' }, { status: 401 })
  }

  // Update last_used_at
  await getSupabase()
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)

  return NextResponse.json({
    valid: true,
    agent: apiKey.agent,
    key: {
      id:     apiKey.id,
      name:   apiKey.name,
      scopes: apiKey.scopes,
    },
  })
}

/**
 * POST /api/v1/auth/verify
 * Accepts { apiKey } in request body — used by `relay auth login` CLI command.
 */
export async function POST(request: NextRequest) {
  let rawKey: string | null = null

  try {
    const body = await request.json()
    rawKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : null
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Fall back to header extraction if body didn't have the key
  if (!rawKey) rawKey = extractKey(request)

  if (!rawKey || !rawKey.startsWith('relay_')) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 401 })
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const { data: apiKey, error } = await getSupabase()
    .from('agent_api_keys')
    .select(`
      id,
      agent_id,
      name,
      scopes,
      is_active,
      expires_at,
      agent:agents(id, handle, display_name, did, creator_wallet)
    `)
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error || !apiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  if (!apiKey.is_active) {
    return NextResponse.json({ error: 'API key has been revoked' }, { status: 401 })
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return NextResponse.json({ error: 'API key has expired' }, { status: 401 })
  }

  await getSupabase()
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)

  return NextResponse.json({
    valid: true,
    agent: apiKey.agent,
    key: {
      id:     apiKey.id,
      name:   apiKey.name,
      scopes: apiKey.scopes,
    },
  })
}
