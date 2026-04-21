/**
 * GET /api/admin/x402-transactions
 *
 * Returns recent x402 outbound payment activity for admin visibility.
 * - Last N transactions (default 100, max 500)
 * - Aggregate totals (today, 24h, 7d, all-time)
 * - Top spending agents
 *
 * Auth: requires the calling user to be in `admin_users`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Auth: must be a logged-in admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

  // Recent transactions
  const { data: txs, error } = await supabase
    .from('agent_x402_transactions')
    .select('id, agent_id, resource_url, description, amount_usdc, tx_signature, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Hydrate agent handles
  const agentIds = Array.from(new Set((txs ?? []).map(t => t.agent_id).filter(Boolean)))
  let agentMap: Record<string, { handle: string; display_name: string }> = {}
  if (agentIds.length) {
    const { data: agents } = await supabase
      .from('agents')
      .select('id, handle, display_name')
      .in('id', agentIds)
    agentMap = Object.fromEntries((agents ?? []).map(a => [a.id, { handle: a.handle, display_name: a.display_name }]))
  }

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const sumWhere = (predicate: (t: any) => boolean) =>
    (txs ?? []).filter(t => t.status === 'completed' && predicate(t))
      .reduce((acc, t) => acc + Number(t.amount_usdc || 0), 0)

  const aggregates = {
    total_count: txs?.length ?? 0,
    completed_count: (txs ?? []).filter(t => t.status === 'completed').length,
    failed_count: (txs ?? []).filter(t => t.status !== 'completed').length,
    spent_24h: sumWhere(t => now - new Date(t.created_at).getTime() < dayMs),
    spent_7d: sumWhere(t => now - new Date(t.created_at).getTime() < 7 * dayMs),
    spent_total: sumWhere(() => true),
  }

  // Top spenders
  const byAgent: Record<string, number> = {}
  for (const t of txs ?? []) {
    if (t.status !== 'completed' || !t.agent_id) continue
    byAgent[t.agent_id] = (byAgent[t.agent_id] ?? 0) + Number(t.amount_usdc || 0)
  }
  const topSpenders = Object.entries(byAgent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([agent_id, spent_usdc]) => ({
      agent_id,
      handle: agentMap[agent_id]?.handle ?? null,
      display_name: agentMap[agent_id]?.display_name ?? null,
      spent_usdc,
    }))

  const transactions = (txs ?? []).map(t => ({
    ...t,
    agent_handle: t.agent_id ? agentMap[t.agent_id]?.handle ?? null : null,
    agent_display_name: t.agent_id ? agentMap[t.agent_id]?.display_name ?? null : null,
  }))

  return NextResponse.json({
    success: true,
    network: process.env.X402_OUTBOUND_NETWORK || 'solana:mainnet',
    aggregates,
    top_spenders: topSpenders,
    transactions,
  })
}
