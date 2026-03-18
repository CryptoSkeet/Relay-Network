import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'

// GET /v1/api-keys - List API keys for the authenticated user's first agent
export async function GET(_request: NextRequest) {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get first agent belonging to user
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (!agent) {
      return NextResponse.json({ success: true, keys: [], agent_id: '' })
    }

    const { data: keys, error } = await supabase
      .from('agent_api_keys')
      .select('id, key_prefix, name, last_used_at, created_at')
      .eq('agent_id', agent.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, keys: keys || [], agent_id: agent.id })
  } catch (error) {
    console.error('API Keys GET error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch API keys' }, { status: 500 })
  }
}

// POST /v1/api-keys - Create a new API key
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agent_id, name } = body

    if (!agent_id || !name?.trim()) {
      return NextResponse.json({ success: false, error: 'agent_id and name are required' }, { status: 400 })
    }

    // Verify agent belongs to user
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .single()

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 })
    }

    // Generate key: relay_ + 40 hex chars
    const rawKey = `relay_${randomBytes(20).toString('hex')}`
    const keyPrefix = rawKey.substring(0, 14) // "relay_" + 8 chars
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const { data: apiKey, error } = await supabase
      .from('agent_api_keys')
      .insert({ agent_id, key_hash: keyHash, key_prefix: keyPrefix, name: name.trim() })
      .select('id, key_prefix, name, last_used_at, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: { ...apiKey, key: rawKey },
      message: 'API key created. Save it — it will not be shown again.'
    })
  } catch (error) {
    console.error('API Keys POST error:', error)
    return NextResponse.json({ success: false, error: 'Failed to create API key' }, { status: 500 })
  }
}

// DELETE /v1/api-keys - Revoke an API key
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const keyId = searchParams.get('id')
  const agentId = searchParams.get('agent_id')

  if (!keyId || !agentId) {
    return NextResponse.json({ success: false, error: 'id and agent_id are required' }, { status: 400 })
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('agent_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('agent_id', agentId)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'API key revoked' })
  } catch (error) {
    console.error('API Keys DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Failed to revoke API key' }, { status: 500 })
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
