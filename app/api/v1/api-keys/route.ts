import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'

/** Verify the authenticated user owns the given agent_id.
 *  If the agent has no user_id yet (SDK-created), claims it for this user. */
async function assertOwnership(request: NextRequest, agentId: string): Promise<{ error: NextResponse } | null> {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: agent } = await supabase
    .from('agents').select('id, user_id').eq('id', agentId).maybeSingle()
  if (!agent) {
    return { error: NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 }) }
  }
  // Claim unclaimed agent (SDK-created agents have user_id = null)
  if (!agent.user_id) {
    await supabase.from('agents').update({ user_id: user.id }).eq('id', agentId)
    return null
  }
  if (agent.user_id !== user.id) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }
  return null
}

// GET /v1/api-keys - List API keys for an agent
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')

  if (!agentId) {
    return NextResponse.json(
      { success: false, error: 'agent_id is required' },
      { status: 400 }
    )
  }

  const ownershipError = await assertOwnership(request, agentId)
  if (ownershipError) return ownershipError.error

  try {
    const { data: keys, error } = await supabase
      .from('agent_api_keys')
      .select('id, key_prefix, name, scopes, last_used_at, expires_at, is_active, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: keys || []
    })
  } catch (error) {
    console.error('API Keys GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch API keys' },
      { status: 500 }
    )
  }
}

// POST /v1/api-keys - Create a new API key
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { agent_id, name, scopes = ['read', 'write'], expires_in_days } = body

    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      )
    }

    if (!name || name.length < 1) {
      return NextResponse.json(
        { success: false, error: 'API key name is required' },
        { status: 400 }
      )
    }

    const ownershipError = await assertOwnership(request, agent_id)
    if (ownershipError) return ownershipError.error

    // Generate API key
    const rawKey = `relay_${randomBytes(32).toString('hex')}`
    const keyPrefix = rawKey.substring(0, 12) + '...'
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    // Calculate expiration
    let expiresAt = null
    if (expires_in_days && expires_in_days > 0) {
      expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    }

    const { data: apiKey, error } = await supabase
      .from('agent_api_keys')
      .insert({
        agent_id,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name,
        scopes,
        expires_at: expiresAt,
        is_active: true
      })
      .select('id, key_prefix, name, scopes, expires_at, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        ...apiKey,
        key: rawKey // Only returned once at creation
      },
      message: 'API key created. Save your key - it will not be shown again.'
    })
  } catch (error: any) {
    console.error('API Keys POST error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create API key' },
      { status: 500 }
    )
  }
}

// DELETE /v1/api-keys - Revoke an API key
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const keyId = searchParams.get('id')
  const agentId = searchParams.get('agent_id')

  if (!keyId || !agentId) {
    return NextResponse.json(
      { success: false, error: 'key id and agent_id are required' },
      { status: 400 }
    )
  }

  const ownershipError = await assertOwnership(request, agentId)
  if (ownershipError) return ownershipError.error

  try {
    const { error } = await supabase
      .from('agent_api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('agent_id', agentId)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'API key revoked'
    })
  } catch (error) {
    console.error('API Keys DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to revoke API key' },
      { status: 500 }
    )
  }
}

// Verify an API key (utility endpoint)
export async function PUT(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { key } = body

    if (!key || !key.startsWith('relay_')) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key format' },
        { status: 400 }
      )
    }

    const keyHash = createHash('sha256').update(key).digest('hex')

    const { data: apiKey, error } = await supabase
      .from('agent_api_keys')
      .select(`
        id,
        agent_id,
        name,
        scopes,
        expires_at,
        is_active,
        agent:agents(id, handle, display_name)
      `)
      .eq('key_hash', keyHash)
      .single()

    if (error || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      )
    }

    if (!apiKey.is_active) {
      return NextResponse.json(
        { success: false, error: 'API key has been revoked' },
        { status: 401 }
      )
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'API key has expired' },
        { status: 401 }
      )
    }

    // Update last used
    await supabase
      .from('agent_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    return NextResponse.json({
      success: true,
      data: {
        agent_id: apiKey.agent_id,
        agent: apiKey.agent,
        scopes: apiKey.scopes
      }
    })
  } catch (error) {
    console.error('API Key verify error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to verify API key' },
      { status: 500 }
    )
  }
}
