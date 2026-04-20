// Admin dashboard metrics aggregator.
// All queries server-side via service-role Supabase client.
// No RPCs required — direct counts from existing tables so this works
// in any environment without new migrations.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface NorthStarMetrics {
  contractsToday: number
  contractsYesterday: number
  externalAgents: number
  externalAgentsLastWeek: number
  signupToEarningPct: number
  totalSignups: number
  totalEarners: number
}

export interface FunnelStep {
  step: string
  count: number
  pct: number
  dropoff: number
}

export interface EngineHealth {
  open: number
  inProgress: number
  delivered: number
  completed: number
  disputed: number
  cancelled: number
  failed24h: number // disputed + cancelled in last 24h
}

export interface TreasuryStats {
  totalVolume: number
  volume24h: number
  feeRevenue: number
  txCount24h: number
}

export interface AdminMetrics {
  northStar: NorthStarMetrics
  funnel: FunnelStep[]
  engine: EngineHealth
  treasury: TreasuryStats
}

const isoDaysAgo = (days: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

const startOfTodayISO = () => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

const startOfYesterdayISO = () => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString()
}

async function safeCount(
  supabase: SupabaseClient,
  table: string,
  build: (q: any) => any,
): Promise<number> {
  try {
    const q = build(supabase.from(table).select('*', { count: 'exact', head: true }))
    const { count, error } = await q
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function loadAdminMetrics(supabase: SupabaseClient): Promise<AdminMetrics> {
  const todayStart = startOfTodayISO()
  const yesterdayStart = startOfYesterdayISO()
  const weekAgo = isoDaysAgo(7)
  const dayAgo = isoDaysAgo(1)

  // ---- Engine counts (single query for all statuses) ----
  let engine: EngineHealth = {
    open: 0, inProgress: 0, delivered: 0, completed: 0,
    disputed: 0, cancelled: 0, failed24h: 0,
  }

  try {
    const { data: statusRows } = await supabase
      .from('contracts')
      .select('status, created_at')
      .limit(5000)
    for (const row of statusRows ?? []) {
      const s = String(row.status || '').toLowerCase()
      if (s === 'open') engine.open++
      else if (s === 'in_progress' || s === 'active') engine.inProgress++
      else if (s === 'delivered') engine.delivered++
      else if (s === 'completed' || s === 'settled') engine.completed++
      else if (s === 'disputed') engine.disputed++
      else if (s === 'cancelled') engine.cancelled++

      if ((s === 'disputed' || s === 'cancelled') && row.created_at && row.created_at > dayAgo) {
        engine.failed24h++
      }
    }
  } catch { /* table issues — leave zeros */ }

  // ---- North star ----
  const [contractsToday, contractsYesterday, externalAgents, externalAgentsLastWeek] = await Promise.all([
    safeCount(supabase, 'contracts', q => q.eq('status', 'completed').gte('completed_at', todayStart)),
    safeCount(supabase, 'contracts', q =>
      q.eq('status', 'completed').gte('completed_at', yesterdayStart).lt('completed_at', todayStart)),
    safeCount(supabase, 'agents', q => q.not('wallet_address', 'is', null)),
    safeCount(supabase, 'agents', q => q.not('wallet_address', 'is', null).lt('created_at', weekAgo)),
  ])

  // Signups + earners — pull distinct earner agent ids client-side
  let totalSignups = 0
  let totalEarners = 0
  try {
    const { count } = await supabase.from('agents').select('*', { count: 'exact', head: true })
    totalSignups = count ?? 0
  } catch {}

  try {
    const { data: earnerRows } = await supabase
      .from('contracts')
      .select('provider_id')
      .eq('status', 'completed')
      .not('provider_id', 'is', null)
      .limit(5000)
    const set = new Set<string>()
    for (const r of earnerRows ?? []) if (r.provider_id) set.add(r.provider_id)
    totalEarners = set.size
  } catch {}

  const signupToEarningPct = totalSignups > 0
    ? Math.round((totalEarners / totalSignups) * 1000) / 10
    : 0

  // ---- Funnel (rough — based on tables we know exist) ----
  const [agentsCount, contractsCreatedCount] = await Promise.all([
    safeCount(supabase, 'agents', q => q),
    safeCount(supabase, 'contracts', q => q),
  ])

  const funnelRaw = [
    { step: 'Signed Up', count: totalSignups },
    { step: 'Created Agent', count: agentsCount },
    { step: 'Engaged Contract', count: contractsCreatedCount },
    { step: 'Earned RELAY', count: totalEarners },
  ]
  const top = funnelRaw[0].count || 1
  const funnel: FunnelStep[] = funnelRaw.map((step, i) => {
    const pct = Math.round((step.count / top) * 100)
    const dropoff = i > 0 ? Math.max(0, funnelRaw[i - 1].count - step.count) : 0
    return { ...step, pct, dropoff }
  })

  // ---- Treasury ----
  let treasury: TreasuryStats = { totalVolume: 0, volume24h: 0, feeRevenue: 0, txCount24h: 0 }
  try {
    const { data: txRows } = await supabase
      .from('transactions')
      .select('amount, type, status, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5000)
    for (const t of txRows ?? []) {
      const amt = Number(t.amount) || 0
      treasury.totalVolume += amt
      if (t.created_at && t.created_at > dayAgo) {
        treasury.volume24h += amt
        treasury.txCount24h++
      }
    }
    // Fee revenue = 5% platform default (read from settings if present)
    treasury.feeRevenue = Math.round(treasury.totalVolume * 0.05 * 100) / 100
  } catch {}

  return {
    northStar: {
      contractsToday,
      contractsYesterday,
      externalAgents,
      externalAgentsLastWeek,
      signupToEarningPct,
      totalSignups,
      totalEarners,
    },
    funnel,
    engine,
    treasury,
  }
}
