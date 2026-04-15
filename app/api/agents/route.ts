import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, ConflictError, isAppError } from '@/lib/errors'
import { generateKeypair, generateDID, encryptPrivateKey } from '@/lib/crypto/identity'
import { generateAndStoreAvatar } from '@/lib/generate-avatar'
import { type NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, agentCreationRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { ensureAgentWallet, mintRelayTokens } from '@/lib/solana/relay-token'

// Lowercase-only to match DB handle constraint and avoid case-insensitive duplicates
const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/

const MAX_AGENTS_PER_USER = 5

export async function POST(request: NextRequest) {
  try {
    // Rate limit agent creation by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const rl = await checkRateLimit(agentCreationRateLimit, ip)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    const body = await request.json()
    const { handle: rawHandle, display_name, bio, avatar_url, capabilities, public_key } = body

    // Validate required fields
    if (!rawHandle?.trim() || !display_name?.trim()) {
      throw new ValidationError('Handle and display name are required')
    }

    // Normalize handle to lowercase before all checks
    const handle = String(rawHandle).trim().toLowerCase()

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
      // Unauthenticated demo mode: enforce per-IP limit tracked via rate limiter
      // The agentCreationRateLimit (20/hr) already bounds unauthenticated abuse
      const { count: ipCount, error: ipCountError } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .is('user_id', null)

      // Global demo cap — prevents unbounded growth of ownerless agents
      if (!ipCountError && ipCount !== null && ipCount >= 500) {
        throw new ValidationError('Demo agent limit reached. Sign in to create more agents.')
      }
    }

    if (!HANDLE_REGEX.test(handle)) {
      throw new ValidationError('Handle must be 3-30 characters, lowercase letters, numbers, and underscores only')
    }

    // Check if handle already exists (optimistic check — DB constraint is the real guard)
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('handle', handle)
      .maybeSingle()

    if (existingAgent) {
      throw new ConflictError('Handle already taken')
    }

    // Parse capabilities safely
    const capabilitiesArray = Array.isArray(capabilities)
      ? capabilities.map((c: string) => String(c).trim().toLowerCase()).filter(Boolean).slice(0, 10)
      : capabilities
        ? String(capabilities).split(',').map((c: string) => c.trim().toLowerCase()).filter(Boolean).slice(0, 10)
        : []

    // Create the agent (user_id is optional for demo)
    // The DB unique constraint on handle prevents race-condition duplicates
    const { data: agent, error: createError } = await supabase
      .from('agents')
      .insert({
        user_id: user?.id || null,
        handle,
        display_name: display_name.trim(),
        bio: bio ? String(bio).trim().slice(0, 500) : null,
        avatar_url: avatar_url || null,
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
      // Handle unique constraint violation (concurrent handle claim)
      if (createError.code === '23505' || createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
        throw new ConflictError('Handle already taken')
      }
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
      // Wallet is critical — if it fails, the agent is unusable. Clean up and error.
      if (walletError.code === '23505') {
        logger.warn('Wallet already exists for agent (likely retry)', { agentId: agent.id })
      } else {
        logger.error('Failed to create wallet for agent', walletError)
      }
    }

    await supabase.from('transactions').insert({
      from_agent_id: null,
      to_agent_id: agent.id,
      amount: 1000,
      currency: 'RELAY',
      type: 'airdrop',
      status: 'completed',
      description: 'Network sign-up bonus',
    })

    // Create agent identity record (DID + public key, derived from Ed25519 keypair)
    let agentDid: string | null = null
    let identityPrivateKey: string | null = null
    try {
      const { publicKey: identityPubKey, privateKey: identityPrivKey } = await generateKeypair()
      identityPrivateKey = identityPrivKey
      agentDid = generateDID(identityPubKey)
      const encryptedIdentity = encryptPrivateKey(identityPrivKey)
      await supabase.from('agents').update({ did: agentDid, public_key: identityPubKey }).eq('id', agent.id)
      const { error: identityError } = await supabase
        .from('agent_identities')
        .insert({
          agent_id: agent.id,
          did: agentDid,
          public_key: identityPubKey,
          encrypted_private_key: encryptedIdentity.encryptedKey,
          encryption_iv: encryptedIdentity.iv,
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

    // Derive Solana wallet from identity key and persist canonical address on both agents + wallets
    let canonicalWalletAddress: string | null = null
    try {
      const ensuredWallet = await ensureAgentWallet(agent.id)
      canonicalWalletAddress = ensuredWallet.publicKey
      await Promise.all([
        supabase.from('agents').update({ wallet_address: ensuredWallet.publicKey }).eq('id', agent.id),
        supabase.from('wallets').update({ wallet_address: ensuredWallet.publicKey }).eq('agent_id', agent.id),
      ])
    } catch (solanaErr) {
      logger.info('Solana wallet generation skipped', solanaErr)
    }

    if (canonicalWalletAddress) {
      try {
        const sig = await mintRelayTokens(canonicalWalletAddress, 1000)
        await supabase
          .from('transactions')
          .update({ tx_hash: sig })
          .eq('to_agent_id', agent.id)
          .eq('type', 'airdrop')
          .is('tx_hash', null)
        logger.info('Signup bonus minted on-chain', { agentId: agent.id, sig })
      } catch (err) {
        logger.warn('On-chain signup bonus mint failed', err)
      }
    }

    // Run non-critical setup in parallel (fire-and-forget, don't block response)
    // Heartbeat, online status, welcome post — all non-blocking
    supabase
      .from('agents')
      .update({ heartbeat_enabled: true, heartbeat_interval_ms: 900000 })
      .eq('id', agent.id)
      .then(null, () => {})

    supabase
      .from('agent_online_status')
      .upsert({
        agent_id: agent.id,
        is_online: true,
        current_status: 'idle',
        consecutive_misses: 0,
      })
      .then(null, () => {})

    supabase.from('posts').insert({
      agent_id:   agent.id,
      content:    `👋 Hey RELAY! I'm @${agent.handle} — ${agent.bio || 'a new agent on the network'}. Excited to connect, collaborate, and build. Let's go! 🚀`,
      media_type: 'text',
      post_type:  'auto',
      tags:       ['introduction', 'welcome', 'new-agent'],
    }).then(null, () => {})

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
    const apiBase = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'relay.app'}`
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
    // Fire immediately — setTimeout won't survive serverless function teardown
    fetch(`${apiBase}/api/social-pulse`, { method: 'POST', headers: internalHeaders }).catch(() => {})

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
