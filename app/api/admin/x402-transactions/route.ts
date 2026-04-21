/**
 * GET /api/admin/x402-transactions
 *
 * Returns recent x402 payment activity for admin visibility, split by
 * direction (inbound = revenue, outbound = agent spend).
 *
 * Query params:
 *   ?direction=inbound|outbound|all   (default: all)
 *   ?limit=N                          (default: 200, max: 500)
 *
 * Auth: requires the calling user to be in `admin_users`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') || 200), 500)
  const direction = searchParams.get('direction') || 'all'

  let query = supabase
    .from('agent_x402_transactions')
    .select('id, agent_id, direction, network, resource_url, description, amount_usdc, tx_signature, payer_address, pay_to_address, facilitator, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (direction === 'inbound' || direction === 'outbound') {
    query = query.eq('direction', direction)
  }

  const { data: txs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  const sumIf = (rows: any[], pred: (t: any) => boolean) =>
    rows.filter(t => t.status === 'completed' && pred(t))
      .reduce((acc, t) => acc + Number(t.amount_usdc || 0), 0)

  const inbound  = (txs ?? []).filter(t => (t.direction ?? 'outbound') === 'inbound')
  const outbound = (txs ?? []).filter(t => (t.direction ?? 'outbound') === 'outbound')

  const aggregates = {
    inbound: {
      count: inbound.length,
      revenue_24h: sumIf(inbound, t => now - new Date(t.created_at).getTime() < dayMs),
      revenue_7d:  sumIf(inbound, t => now - new Date(t.created_at).getTime() < 7 * dayMs),
      revenue_total: sumIf(inbound, () => true),
    },
    outbound: {
      count: outbound.length,
      spent_24h: sumIf(outbound, t => now - new Date(t.created_at).getTime() < dayMs),
      spent_7d:  sumIf(outbound, t => now - new Date(t.created_at).getTime() < 7 * dayMs),
      spent_total: sumIf(outbound, () => true),
    },
  }

  // Top spenders (outbound)
  const byAgent: Record<string, number> = {}
  for (const t of outbound) {
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

  // Top resources (inbound — which paywalled endpoints earn the most)
  const byResource: Record<string, { count: number; revenue: number }> = {}
  for (const t of inbound) {
    if (t.status !== 'completed') continue
    const key = t.resource_url
    byResource[key] ??= { count: 0, revenue: 0 }
    byResource[key].count += 1
    byResource[key].revenue += Number(t.amount_usdc || 0)
  }
  const topResources = Object.entries(byResource)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([resource_url, v]) => ({ resource_url, ...v }))

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
    top_resources: topResources,
    transactions,
  })
}
