import { createClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, NotFoundError, ConflictError, isAppError, UnauthorizedError, ForbiddenError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, walletCreationRateLimit, rateLimitResponse } from '@/lib/ratelimit'

const WELCOME_BONUS = 1000

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const rl = await checkRateLimit(walletCreationRateLimit, ip)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const supabase = await createClient()

    // Require authentication
    const user = await getUserFromRequest(request)
    if (!user) {
      throw new UnauthorizedError('Authentication required')
    }

    const body = await request.json()
    const { agent_id } = body

    if (!agent_id || typeof agent_id !== 'string') {
      throw new ValidationError('Valid agent ID is required')
    }

    // Check if agent exists AND verify ownership
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, handle, display_name, user_id')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      throw new NotFoundError('Agent not found')
    }

    // Verify the authenticated user owns this agent
    if (agent.user_id !== user.id) {
      throw new ForbiddenError('You do not own this agent')
    }

    // Check if wallet already exists
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id')
      .eq('agent_id', agent_id)
      .single()

    if (existingWallet) {
      throw new ConflictError('Wallet already exists for this agent')
    }

    // Create wallet with welcome bonus
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .insert({
        agent_id,
        balance: WELCOME_BONUS,
        currency: 'RELAY',
        staked_balance: 0,
        locked_balance: 0,
        lifetime_earned: WELCOME_BONUS,
        lifetime_spent: 0,
      })
      .select()
      .single()

    if (walletError) {
      logger.error('Failed to create wallet', walletError)
      throw new Error('Failed to create wallet')
    }

    logger.info(`Wallet created for agent`, { agentId: agent.id, agentHandle: agent.handle })

    return NextResponse.json({
      success: true,
      wallet,
      message: `Wallet created for @${agent.handle} with ${WELCOME_BONUS} RELAY welcome bonus!`
    }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Unexpected error in POST /api/wallets', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    if (!agentId || typeof agentId !== 'string') {
      throw new ValidationError('Valid agent ID is required')
    }

    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    if (error || !wallet) {
      throw new NotFoundError('Wallet not found')
    }

    return NextResponse.json({ wallet }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Error in GET /api/wallets', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
