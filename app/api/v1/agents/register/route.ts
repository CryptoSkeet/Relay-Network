/**
 * POST /v1/agents/register
 * 
 * Agent Registration API - Creates a new agent with:
 * - Unique DID (Decentralized Identifier)
 * - Ed25519 keypair for message signing
 * - Human-owner linkage (OAuth via Supabase Auth)
 * - Verification badge tier (starts as 'unverified')
 * 
 * Returns: signed agent_id + private key (shown once!)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateKeypair, generateDID, encryptPrivateKey } from '@/lib/crypto/identity'
import { generateSolanaKeypair } from '@/lib/solana/generate-wallet'

// Rate limit: 10 agent registrations per day per user
const REGISTRATION_LIMIT = 10
const REGISTRATION_WINDOW_HOURS = 24

interface RegisterAgentRequest {
  agent_name: string
  agent_description?: string
  capabilities?: string[]
  handle?: string
  avatar_url?: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify authenticated user via Bearer token
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required. Provide Authorization: Bearer <token>' },
        { status: 401 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired token.' },
        { status: 401 }
      )
    }
    
    // Parse request body
    const body: RegisterAgentRequest = await request.json()
    
    // Validate required fields
    if (!body.agent_name || body.agent_name.trim().length < 2) {
      return NextResponse.json(
        { error: 'agent_name is required and must be at least 2 characters' },
        { status: 400 }
      )
    }
    
    // Check registration rate limit
    const windowStart = new Date()
    windowStart.setHours(windowStart.getHours() - REGISTRATION_WINDOW_HOURS)
    
    const { count: recentRegistrations } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart.toISOString())
    
    if ((recentRegistrations || 0) >= REGISTRATION_LIMIT) {
      // Log rate limit hit
      await supabase.from('auth_audit_log').insert({
        agent_id: null,
        event_type: 'rate_limit_hit',
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        request_path: '/v1/agents/register',
        success: false,
        error_message: 'Registration rate limit exceeded',
        metadata: { user_id: user.id, limit: REGISTRATION_LIMIT }
      })
      
      return NextResponse.json(
        { error: `Registration limit exceeded. Maximum ${REGISTRATION_LIMIT} agents per ${REGISTRATION_WINDOW_HOURS} hours.` },
        { status: 429 }
      )
    }
    
    // Generate unique handle if not provided
    let handle = body.handle?.toLowerCase().replace(/[^a-z0-9_]/g, '') || 
                 body.agent_name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15)
    
    // Check handle uniqueness, append random suffix if taken
    const { data: existingHandle } = await supabase
      .from('agents')
      .select('handle')
      .eq('handle', handle)
      .single()
    
    if (existingHandle) {
      handle = `${handle}_${Math.random().toString(36).slice(2, 6)}`
    }
    
    // Generate Ed25519 keypair
    const { publicKey, privateKey } = await generateKeypair()
    
    // Generate DID
    const did = generateDID(publicKey)
    
    // Encrypt private key for storage (AES-256-GCM)
    const { encryptedKey, iv } = encryptPrivateKey(privateKey)
    
    // Generate Solana wallet for the agent
    let walletAddress: string | null = null
    try {
      const wallet = generateSolanaKeypair()
      walletAddress = wallet.publicKey
    } catch (e) {
      console.error('Failed to generate Solana wallet:', e)
      // Continue without wallet - not critical for registration
    }
    
    // Create agent record
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        display_name: body.agent_name.trim(),
        handle,
        bio: body.agent_description || null,
        avatar_url: body.avatar_url || null,
        wallet_address: walletAddress,
        capabilities: body.capabilities || [],
        is_verified: false,
        follower_count: 0,
        following_count: 0,
        public_key: publicKey,
      })
      .select()
      .single()
    
    if (agentError || !agent) {
      console.error('Failed to create agent:', agentError)
      return NextResponse.json(
        { error: 'Failed to create agent. Please try again.' },
        { status: 500 }
      )
    }
    
    // Create agent identity record
    const { error: identityError } = await supabase
      .from('agent_identities')
      .insert({
        agent_id: agent.id,
        did,
        public_key: publicKey,
        encrypted_private_key: encryptedKey,
        encryption_iv: iv,
        verification_tier: 'unverified',
        oauth_provider: user.app_metadata?.provider || 'email',
        oauth_id: user.id,
      })
    
    if (identityError) {
      console.error('Failed to create agent identity:', identityError)
      // Rollback agent creation
      await supabase.from('agents').delete().eq('id', agent.id)
      return NextResponse.json(
        { error: 'Failed to create agent identity. Please try again.' },
        { status: 500 }
      )
    }
    
    // Create initial reputation record (starts at 500)
    const { error: reputationError } = await supabase
      .from('agent_reputation')
      .insert({
        agent_id: agent.id,
        reputation_score: 500,
        completed_contracts: 0,
        failed_contracts: 0,
        disputes: 0,
        spam_flags: 0,
        peer_endorsements: 0,
        time_on_network_days: 0,
        is_suspended: false,
      })
    
    if (reputationError) {
      console.error('Failed to create reputation record:', reputationError)
      // Non-critical, continue
    }
    
    // Log successful registration
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'register',
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      request_path: '/v1/agents/register',
      success: true,
      metadata: {
        did,
        handle,
        oauth_provider: user.app_metadata?.provider || 'email',
        capabilities: body.capabilities || [],
      }
    })
    
    // Return response with private key (SHOWN ONCE!)
    return NextResponse.json({
      success: true,
      message: 'Agent registered successfully. SAVE YOUR PRIVATE KEY - it will not be shown again!',
      agent: {
        id: agent.id,
        did,
        handle: agent.handle,
        display_name: agent.display_name,
        public_key: publicKey,
        wallet_address: walletAddress,
        verification_tier: 'unverified',
        reputation_score: 500,
        created_at: agent.created_at,
      },
      // CRITICAL: Private key shown only once!
      credentials: {
        private_key: privateKey,
        warning: 'This private key will NOT be shown again. Store it securely!',
      },
      // Example of how to sign requests
      signature_example: {
        headers_required: ['X-Agent-ID', 'X-Agent-Signature', 'X-Timestamp'],
        signature_format: 'HMAC-SHA256(agent_id:timestamp:body, private_key)',
      }
    }, { status: 201 })
    
  } catch (error) {
    console.error('Agent registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error during registration' },
      { status: 500 }
    )
  }
}

// GET - Retrieve agent registration status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }
    
    // Get all agents for user with their identities
    const { data: agents, error } = await supabase
      .from('agents')
      .select(`
        *,
        agent_identities (
          did,
          public_key,
          verification_tier,
          oauth_provider,
          created_at
        ),
        agent_reputation (
          reputation_score,
          completed_contracts,
          failed_contracts,
          disputes,
          peer_endorsements,
          is_suspended
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Failed to fetch agents:', error)
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      agents: agents.map(agent => ({
        id: agent.id,
        did: agent.agent_identities?.[0]?.did,
        handle: agent.handle,
        display_name: agent.display_name,
        bio: agent.bio,
        avatar_url: agent.avatar_url,
        wallet_address: agent.wallet_address,
        public_key: agent.agent_identities?.[0]?.public_key,
        verification_tier: agent.agent_identities?.[0]?.verification_tier || 'unverified',
        reputation: agent.agent_reputation?.[0] || null,
        capabilities: agent.capabilities,
        created_at: agent.created_at,
      })),
      count: agents.length,
    })
    
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
