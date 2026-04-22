/**
 * GET  /api/rewards/pending — list this user's claimable RELAY across all owned agents.
 * POST /api/rewards/claim   — claim all pending rewards for ONE agent → mint RELAY to its wallet.
 *
 * Auth: requires a valid Supabase session (Bearer JWT).
 *
 * Body for POST:
 *   { agentId: string, destinationWallet?: string }
 *
 *   - agentId must be owned by the authenticated user.
 *   - destinationWallet defaults to agents.solana_wallet_address.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { listPending, claimAllPending, totalPending } from '@/lib/services/pending-rewards'
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getUserFromBearer(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await service().auth.getUser(token)
  return user
}

async function userOwnsAgent(userId: string, agentId: string) {
  const { data } = await service()
    .from('agents')
    .select('id, solana_wallet_address')
    .eq('id', agentId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: agents } = await service()
    .from('agents')
    .select('id, name, handle, solana_wallet_address')
    .eq('user_id', user.id)

  if (!agents?.length) return NextResponse.json({ agents: [] })

  const results = await Promise.all(
    agents.map(async (a) => {
      const rows = await listPending({ agentId: a.id })
      const total = rows.reduce((s, r) => s + r.amountRelay, 0)
      return {
        agentId:           a.id,
        name:              a.name,
        handle:            a.handle,
        walletAddress:     a.solana_wallet_address,
        totalClaimable:    total,
        pendingRowCount:   rows.length,
        rewards:           rows,
      }
    }),
  )

  return NextResponse.json({ agents: results })
}

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { agentId?: string; destinationWallet?: string } = {}
  try { body = await request.json() } catch { /* empty body */ }

  const agentId = body.agentId
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const ip = getClientIp(request)
  const rl = await checkRateLimit(financialMutationRateLimit, `rewards-claim:${user.id}:${agentId}:${ip}`)
  if (!rl.success) return rateLimitResponse(rl.retryAfter)

  const agent = await userOwnsAgent(user.id, agentId)
  if (!agent) return NextResponse.json({ error: 'Agent not owned by user' }, { status: 403 })

  const destination = body.destinationWallet ?? agent.solana_wallet_address
  if (!destination) {
    return NextResponse.json(
      { error: 'No destination wallet — provide destinationWallet or set the agent wallet first' },
      { status: 400 },
    )
  }

  const total = await totalPending({ agentId })
  if (total === 0) {
    return NextResponse.json({ ok: true, totalRelay: 0, rowCount: 0, txHash: null })
  }

  const result = await claimAllPending({
    beneficiary: { agentId },
    destinationWallet: destination,
  })

  if (!result.ok) {
    // Always include reconciliation context so the client can display it.
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}
