/**
 * GET /api/ops/errors
 *
 * Live error / failure feed for the admin Error Monitor card.
 *
 * Sources:
 *   1. Railway service in-process metrics (errorRate, errorsByType, sampleSize)
 *      via `${RAILWAY_HEARTBEAT_HEALTH_URL}` host + `/metrics`.
 *      NOTE: counters reset on every Railway deploy.
 *   2. Supabase `admin_logs` rows from the last 24h whose action contains
 *      FAIL / ERROR / DISABLED / SHUTDOWN — surfaced as recent operational
 *      incidents.
 *
 * Auth: privileged admin role required.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RailwayErrors {
  source: 'railway-metrics' | 'unconfigured' | 'unreachable'
  totalRequests: number | null
  totalErrors: number | null
  errorRate: string | null
  errorsByType: Record<string, number>
  sampleSize: number | null
  detail: string
  fetchedAt: string | null
}

interface AdminIncident {
  id: string
  action: string
  target_type: string | null
  target_id: string | null
  details: any
  created_at: string
}

interface ErrorsResponse {
  railway: RailwayErrors
  adminIncidents24h: {
    count: number
    items: AdminIncident[]
  }
  collectedAt: string
  refreshIntervalMs: number
}

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h

const FAILURE_ACTION_PATTERN = /(FAIL|ERROR|DISABLED|SHUTDOWN|REJECT|REVERTED|TIMEOUT)/i

function metricsUrlFromHealth(healthUrl: string | undefined): string | null {
  if (!healthUrl) return null
  try {
    const u = new URL(healthUrl)
    u.pathname = '/metrics'
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}

async function fetchRailwayMetrics(): Promise<RailwayErrors> {
  const healthUrl = process.env.RAILWAY_HEARTBEAT_HEALTH_URL?.trim()
  const metricsUrl = metricsUrlFromHealth(healthUrl)
  if (!metricsUrl) {
    return {
      source: 'unconfigured',
      totalRequests: null,
      totalErrors: null,
      errorRate: null,
      errorsByType: {},
      sampleSize: null,
      detail: 'Set RAILWAY_HEARTBEAT_HEALTH_URL to enable live metrics.',
      fetchedAt: null,
    }
  }

  try {
    const res = await fetch(metricsUrl, { cache: 'no-store' })
    if (!res.ok) {
      return {
        source: 'unreachable',
        totalRequests: null,
        totalErrors: null,
        errorRate: null,
        errorsByType: {},
        sampleSize: null,
        detail: `HTTP ${res.status} from ${metricsUrl}`,
        fetchedAt: new Date().toISOString(),
      }
    }
    const j = (await res.json()) as any
    return {
      source: 'railway-metrics',
      totalRequests: typeof j.totalRequests === 'number' ? j.totalRequests : null,
      totalErrors: typeof j.totalErrors === 'number' ? j.totalErrors : null,
      errorRate: typeof j.errorRate === 'string' ? j.errorRate : null,
      errorsByType: j.errorsByType && typeof j.errorsByType === 'object' ? j.errorsByType : {},
      sampleSize: typeof j.sampleSize === 'number' ? j.sampleSize : null,
      detail: 'In-process counters reset on every Railway deploy.',
      fetchedAt: new Date().toISOString(),
    }
  } catch (e: any) {
    return {
      source: 'unreachable',
      totalRequests: null,
      totalErrors: null,
      errorRate: null,
      errorsByType: {},
      sampleSize: null,
      detail: `fetch failed: ${e?.message ?? 'unknown'}`,
      fetchedAt: new Date().toISOString(),
    }
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const supabase = await createClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [railway, logs] = await Promise.all([
    fetchRailwayMetrics(),
    supabase
      .from('admin_logs')
      .select('id, action, target_type, target_id, details, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const allRecent = (logs.data ?? []) as AdminIncident[]
  const failures = allRecent.filter(r => FAILURE_ACTION_PATTERN.test(r.action || ''))

  const body: ErrorsResponse = {
    railway,
    adminIncidents24h: {
      count: failures.length,
      items: failures.slice(0, 20),
    },
    collectedAt: new Date().toISOString(),
    refreshIntervalMs: REFRESH_INTERVAL_MS,
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
