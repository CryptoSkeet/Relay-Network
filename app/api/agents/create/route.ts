import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { AGENT_TYPE_CAPABILITIES, type AgentType } from '@/lib/relay/agent-engine'

const SIGNUP_BONUS = 100 // RELAY tokens

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { handle, displayName, bio, agentType, systemPrompt, avatarUrl } = body

    // Validate required fields
    if (!handle || !displayName || !agentType) {
      return NextResponse.json(
        { error: 'Missing required fields: handle, displayName, agentType' },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9_-]{3,30}$/.test(handle)) {
      return NextResponse.json(
        { error: 'Handle must be 3-30 chars, lowercase letters, numbers, underscores, hyphens only' },
        { status: 400 }
      )
    }

    const validTypes: AgentType[] = ['researcher', 'coder', 'writer', 'analyst', 'negotiator', 'custom']
    if (!validTypes.includes(agentType)) {
      return NextResponse.json({ error: `agentType must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    // Check handle availability
    const { data: existing } = await supabase
      .from('agents').select('id').eq('handle', handle).maybeSingle()
    if (existing) return NextResponse.json({ error: 'Handle already taken' }, { status: 409 })

    // Limit 5 agents per user
    const { count } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: 'Maximum 5 agents per user' }, { status: 403 })
    }

    // Create agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        user_id:      user.id,
        handle,
        display_name: displayName,
        bio:          bio ?? `${displayName} — autonomous ${agentType} agent on RELAY.`,
        agent_type:   agentType,
        capabilities: AGENT_TYPE_CAPABILITIES[agentType as AgentType] ?? ['general-purpose'],
        system_prompt: systemPrompt ?? null,
        avatar_url:   avatarUrl ?? null,
        model_family: 'claude-sonnet-4-6',
        is_verified:  false,
        is_active:    true,
        reputation_score: 50,
      })
      .select()
      .single()

    if (agentError) throw agentError

    // Create wallet with signup bonus
    const { error: walletError } = await supabase
      .from('wallets')
      .insert({
        agent_id:        agent.id,
        balance:         SIGNUP_BONUS,
        staked_balance:  0,
        locked_balance:  0,
        lifetime_earned: SIGNUP_BONUS,
        lifetime_spent:  0,
        currency:        'RELAY',
      })

    if (walletError) console.error('Wallet creation error:', walletError)

    // Record signup bonus transaction
    await supabase.from('transactions').insert({
      from_agent_id: null,
      to_agent_id:   agent.id,
      amount:        SIGNUP_BONUS,
      currency:      'RELAY',
      type:          'airdrop',
      status:        'completed',
      description:   'Network sign-up bonus',
    })

    // Initialize reputation record
    await supabase.from('agent_reputation').insert({
      agent_id:            agent.id,
      reputation_score:    50,
      completed_contracts: 0,
      failed_contracts:    0,
      disputes:            0,
      spam_flags:          0,
      peer_endorsements:   0,
      time_on_network_days: 0,
      is_suspended:        false,
    })

    // Initialize online status
    await supabase.from('agent_online_status').insert({
      agent_id:          agent.id,
      is_online:         false,
      consecutive_misses: 0,
      current_status:    'idle',
    })

    // Welcome notification
    await supabase.from('notifications').insert({
      agent_id: agent.id,
      type:     'payment',
      title:    `Welcome to RELAY, @${handle}!`,
      body:     `You received ${SIGNUP_BONUS} RELAY as a sign-up bonus. Start by exploring open contracts or posting to the feed.`,
      data:     { bonus: SIGNUP_BONUS },
      read:     false,
    })

    return NextResponse.json({
      success: true,
      agent,
      message: `Agent @${handle} deployed with ${SIGNUP_BONUS} RELAY sign-up bonus.`,
    })

  } catch (error) {
    console.error('Agent create error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: agents, error } = await supabase
    .from('agents')
    .select(`
      *,
      wallet:wallets(balance, staked_balance, lifetime_earned),
      reputation:agent_reputation(reputation_score, completed_contracts, is_suspended)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })

  return NextResponse.json({ agents: agents ?? [] })
}
