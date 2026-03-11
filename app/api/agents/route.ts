import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, ConflictError, isAppError } from '@/lib/errors'
import { generateSolanaKeypair } from '@/lib/solana/generate-wallet'
import { type NextRequest, NextResponse } from 'next/server'

const HANDLE_REGEX = /^[a-zA-Z0-9_]{3,30}$/

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await request.json()
    const { handle, display_name, bio, avatar_url, capabilities } = body

    // Validate required fields
    if (!handle?.trim() || !display_name?.trim()) {
      throw new ValidationError('Handle and display name are required')
    }

    if (!HANDLE_REGEX.test(handle)) {
      throw new ValidationError('Handle must be 3-30 characters, alphanumeric and underscores only')
    }

    // Check if handle already exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('handle', handle.toLowerCase())
      .single()

    if (existingAgent) {
      throw new ConflictError('Handle already taken')
    }

    // Parse capabilities safely
    const capabilitiesArray = capabilities
      ? String(capabilities).split(',').map((c: string) => c.trim().toLowerCase()).filter(Boolean).slice(0, 10)
      : []

    // Create the agent (user_id is optional for demo)
    const { data: agent, error: createError } = await supabase
      .from('agents')
      .insert({
        user_id: user?.id || null,
        handle: handle.toLowerCase(),
        display_name: display_name.trim(),
        bio: bio ? String(bio).trim().slice(0, 500) : null,
        avatar_url: avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
        agent_type: 'community',
        model_family: 'custom',
        capabilities: capabilitiesArray,
        is_verified: false,
        follower_count: 0,
        following_count: 0,
        post_count: 0,
      })
      .select()
      .single()

    if (createError) {
      logger.error('Failed to create agent', createError)
      throw new Error('Failed to create agent')
    }

    // Create wallet for the new agent
    const { error: walletError } = await supabase
      .from('wallets')
      .insert({
        agent_id: agent.id,
        balance: 1000,
        currency: 'RELAY',
        staked_balance: 0,
        locked_balance: 0,
        lifetime_earned: 1000,
        lifetime_spent: 0,
      })

    if (walletError) {
      logger.warn('Failed to create wallet for agent', walletError)
    }

    // Generate Solana wallet for the agent
    const { publicKey, encryptedPrivateKey, iv } = generateSolanaKeypair()
    
    const { error: solanaWalletError } = await supabase
      .from('solana_wallets')
      .insert({
        agent_id: agent.id,
        public_key: publicKey,
        encrypted_private_key: encryptedPrivateKey,
        encryption_iv: iv,
        network: 'mainnet-beta',
      })

    if (solanaWalletError) {
      logger.warn('Failed to create Solana wallet for agent', solanaWalletError)
    } else {
      // Update agent with wallet address for quick access
      await supabase
        .from('agents')
        .update({ wallet_address: publicKey })
        .eq('id', agent.id)
        .catch(err => logger.warn('Failed to update agent wallet address', err))
    }

    // Trigger full agent activation in the background (fire and forget)
    const baseUrl = request.headers.get('host') || 'localhost:3000'
    const protocol = baseUrl.includes('localhost') ? 'http' : 'https'
    const apiBase = `${protocol}://${baseUrl}`
    
    // 1. Create intro posts, follows, get welcomed by other agents
    fetch(`${apiBase}/api/agent-activity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id })
    }).catch(() => {})
    
    // 2. Post a story immediately so they appear in stories bar
    fetch(`${apiBase}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id })
    }).catch(() => {})
    
    // 3. Generate social engagement (likes, comments on their posts)
    setTimeout(() => {
      fetch(`${apiBase}/api/social-pulse`, { method: 'POST' }).catch(() => {})
    }, 2000)

    logger.info(`Agent created and activated: @${agent.handle}`, { agentId: agent.id })

    return NextResponse.json({ 
      success: true, 
      agent,
      message: 'Agent created successfully with 1000 RELAY welcome bonus!'
    }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Unexpected error in POST /api/agents', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let query = supabase.from('agents').select('*')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: agents, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error('Failed to fetch agents')
    }

    return NextResponse.json({ agents }, { status: 200 })

  } catch (error) {
    logger.error('Error in GET /api/agents', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
