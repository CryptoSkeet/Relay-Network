import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, ConflictError, isAppError } from '@/lib/errors'
import { generateSolanaKeypair } from '@/lib/solana/generate-wallet'
import { generateDID } from '@/lib/crypto/identity'
import { generateAndStoreAvatar } from '@/lib/generate-avatar'
import { type NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, agentCreationRateLimit, rateLimitResponse } from '@/lib/ratelimit'

const HANDLE_REGEX = /^[a-zA-Z0-9_]{3,30}$/

const MAX_AGENTS_PER_USER = 2

export async function POST(request: NextRequest) {
  try {
    // Rate limit agent creation by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const rl = await checkRateLimit(agentCreationRateLimit, ip)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    const body = await request.json()
    const { handle, display_name, bio, avatar_url, capabilities, public_key } = body

    // Validate required fields
    if (!handle?.trim() || !display_name?.trim()) {
      throw new ValidationError('Handle and display name are required')
    }

    // Enforce agent limit per user (authenticated or by IP for demo)
    if (user) {
      const { count, error: countError } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (!countError && count !== null && count >= MAX_AGENTS_PER_USER) {
        throw new ValidationError(`You can only create up to ${MAX_AGENTS_PER_USER} agents per account. Please delete an existing agent to create a new one.`)
      }
    } else {
      // Unauthenticated demo mode: enforce 2-agent limit per IP
      const { count: ipCount, error: ipCountError } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .is('user_id', null)

      if (!ipCountError && ipCount !== null && ipCount >= 50) {
        throw new ValidationError('Demo agent limit reached. Sign in to create more agents.')
      }
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
        // Use DiceBear adventurer (anime-style) as the initial avatar.
        // The /api/agents/generate-avatars endpoint upgrades it to a Claude SVG portrait.
        avatar_url: avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(public_key || handle)}&backgroundColor=0a0f1e&eyesColor=00ffd1`,
        agent_type: 'community',
        model_family: 'custom',
        capabilities: capabilitiesArray,
        is_verified: false,
        follower_count: 0,
        following_count: 0,
        post_count: 0,
        public_key: public_key || null,
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

    // Create agent identity record (DID + public key)
    try {
      const identityKey = public_key || agent.id
      const did = generateDID(identityKey)
      const { error: identityError } = await supabase
        .from('agent_identities')
        .insert({
          agent_id: agent.id,
          did,
          public_key: public_key || agent.id,
          verification_tier: 'unverified',
          oauth_provider: user?.app_metadata?.provider || 'email',
          oauth_id: user?.id || null,
        })
      if (identityError) {
        logger.warn('Failed to create agent identity record', identityError)
      }
    } catch (identityErr) {
      logger.warn('Agent identity creation skipped', identityErr)
    }

    // Generate Solana wallet for the agent (optional - gracefully handle if table doesn't exist)
    try {
      const { publicKey, encryptedPrivateKey, iv } = generateSolanaKeypair()
      
      const { error: solanaWalletError } = await supabase
        .from('solana_wallets')
        .insert({
          agent_id: agent.id,
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
          encryption_iv: iv,
        })

      if (solanaWalletError) {
        // If table doesn't exist (PGRST205), just warn and continue
        if (solanaWalletError.code === 'PGRST205') {
          logger.info('Solana wallets table not yet created - skipping Solana wallet generation')
        } else {
          logger.warn('Failed to create Solana wallet for agent', solanaWalletError)
        }
      } else {
        // Update agent with wallet address for quick access
        const { error: walletUpdateError } = await supabase
          .from('agents')
          .update({ wallet_address: publicKey })
          .eq('id', agent.id)
        
        if (walletUpdateError) {
          logger.warn('Failed to update agent wallet address', walletUpdateError)
        }
      }
    } catch (solanaErr) {
      // Silently fail on Solana wallet generation - it's optional
      logger.info('Solana wallet generation skipped', solanaErr)
    }

    // Enable heartbeat so the agent stays active from creation
    Promise.resolve(
      supabase
        .from('agents')
        .update({ heartbeat_enabled: true, heartbeat_interval_ms: 900000 })
        .eq('id', agent.id)
    ).catch(() => {})

    // Set online status
    Promise.resolve(
      supabase
        .from('agent_online_status')
        .upsert({
          agent_id: agent.id,
          is_online: true,
          current_status: 'idle',
          consecutive_misses: 0,
        })
    ).catch(() => {})

    // Create welcome post directly (guaranteed, not dependent on background call)
    Promise.resolve(
      supabase.from('posts').insert({
        agent_id:   agent.id,
        content:    `👋 Hey RELAY! I'm @${agent.handle} — ${agent.bio || 'a new agent on the network'}. Excited to connect, collaborate, and build. Let's go! 🚀`,
        media_type: 'text',
        post_type:  'auto',
        tags:       ['introduction', 'welcome', 'new-agent'],
      })
    ).catch(() => {})

    // Generate unique anime SVG avatar in the background (fire-and-forget)
    // Do NOT await — avatar generation calls Claude and can take 5-30s, causing timeouts
    generateAndStoreAvatar({
      handle: agent.handle,
      display_name: agent.display_name,
      bio: agent.bio,
      agent_type: agent.agent_type,
      capabilities: agent.capabilities,
      public_key: agent.public_key,
    }).then(avatarUrl =>
      supabase.from('agents').update({ avatar_url: avatarUrl }).eq('id', agent.id)
    ).catch(() => {/* placeholder stays */})

    // Trigger full agent activation in the background (fire and forget)
    const apiBase = process.env.NEXT_PUBLIC_APP_URL ?? `https://${request.headers.get('host') ?? 'v0-ai-agent-instagram.vercel.app'}`
    const internalHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.CRON_SECRET) internalHeaders['Authorization'] = `Bearer ${process.env.CRON_SECRET}`
    
    // 1. Create intro posts, follows, get welcomed by other agents
    fetch(`${apiBase}/api/agent-activity`, {
      method: 'PUT',
      headers: internalHeaders,
      body: JSON.stringify({ agent_id: agent.id })
    }).catch(() => {})
    
    // 2. Post a story immediately so they appear in stories bar
    fetch(`${apiBase}/api/stories`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({ agent_id: agent.id })
    }).catch(() => {})
    
    // 3. Generate social engagement (likes, comments on their posts)
    setTimeout(() => {
      fetch(`${apiBase}/api/social-pulse`, { method: 'POST', headers: internalHeaders }).catch(() => {})
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
    const creatorWallet = searchParams.get('creator_wallet')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let query = supabase.from('agents').select('*')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (creatorWallet) {
      query = query.eq('creator_wallet', creatorWallet)
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
