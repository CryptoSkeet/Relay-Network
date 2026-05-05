/**
 * GET /api/admin/users
 *
 * Lists Supabase auth users with derived stats:
 *   - handle (from agents.handle, first owned agent)
 *   - wallet_address (first owned agent)
 *   - contracts_completed (count from contracts)
 *   - relay_earned (sum from completed contracts where they're provider)
 *   - banned (auth.users.banned_until > now())
 *
 * Query params:
 *   ?search=foo       case-insensitive email/handle filter
 *   ?filter=all|active|no-agent|earning
 *   ?limit=N          default 100, max 500
 *
 * Auth: super-user only (4dirby@gmail.com) — touches PII for every account.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface UserRow {
  id: string
  email: string | null
  created_at: string
  handle: string | null
  wallet_address: string | null
  contracts_completed: number
  relay_earned: number
  banned: boolean
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request, { requireSuperUser: true })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const filter = searchParams.get('filter') ?? 'all'
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)

  const admin = createAdminClient()

  // List auth users (paginated). For solo founder scale we list 1 page.
  const { data: usersList, error: usersErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: limit,
  })
  if (usersErr) {
    return NextResponse.json({ error: `auth.listUsers: ${usersErr.message}` }, { status: 500 })
  }

  const users = usersList?.users ?? []
  const userIds = users.map(u => u.id)

  // Pull all agents for these users in one query
  const { data: agents } = await admin
    .from('agents')
    .select('id, user_id, handle, wallet_address')
    .in('user_id', userIds)

  const agentByUser = new Map<string, { id: string; handle: string | null; wallet_address: string | null }>()
  const agentIds: string[] = []
  for (const a of agents ?? []) {
    if (!a.user_id) continue
    if (!agentByUser.has(a.user_id)) {
      agentByUser.set(a.user_id, { id: a.id, handle: a.handle, wallet_address: a.wallet_address })
    }
    agentIds.push(a.id)
  }

  // Pull completed contracts for these agents
  const contractStats = new Map<string, { count: number; earned: number }>()
  if (agentIds.length > 0) {
    const { data: contracts } = await admin
      .from('contracts')
      .select('provider_id, payout_amount, amount, status')
      .in('provider_id', agentIds)
      .eq('status', 'completed')
    for (const c of contracts ?? []) {
      if (!c.provider_id) continue
      const cur = contractStats.get(c.provider_id) ?? { count: 0, earned: 0 }
      cur.count += 1
      cur.earned += Number(c.payout_amount ?? c.amount ?? 0) || 0
      contractStats.set(c.provider_id, cur)
    }
  }

  const now = Date.now()
  const rows: UserRow[] = users.map(u => {
    const agent = agentByUser.get(u.id) ?? null
    const stats = agent ? contractStats.get(agent.id) ?? { count: 0, earned: 0 } : { count: 0, earned: 0 }
    const bannedUntil = (u as any).banned_until ? Date.parse((u as any).banned_until) : 0
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      handle: agent?.handle ?? null,
      wallet_address: agent?.wallet_address ?? null,
      contracts_completed: stats.count,
      relay_earned: Math.round(stats.earned * 100) / 100,
      banned: bannedUntil > now,
    }
  })

  let filtered = rows
  if (search) {
    filtered = filtered.filter(r =>
      (r.email ?? '').toLowerCase().includes(search) ||
      (r.handle ?? '').toLowerCase().includes(search),
    )
  }
  if (filter === 'no-agent') filtered = filtered.filter(r => !r.handle)
  else if (filter === 'earning') filtered = filtered.filter(r => r.relay_earned > 0)
  else if (filter === 'active') filtered = filtered.filter(r => !r.banned)

  return NextResponse.json({
    success: true,
    users: filtered,
    total: filtered.length,
    grand_total: rows.length,
  })
}
