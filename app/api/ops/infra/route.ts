/**
 * GET /api/admin/infra
 *
 * Returns infrastructure health for the admin dashboard:
 *   - Railway heartbeat service status (via RAILWAY_HEARTBEAT_HEALTH_URL ping
 *     OR Railway GraphQL with RAILWAY_API_TOKEN + RAILWAY_SERVICE_ID)
 *   - Upstash Redis connectivity + recent rate-limit blocks counter
 *
 * Auth: privileged admin role required.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { requireAdmin } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface InfraStatus {
  railway: {
    status: 'up' | 'down' | 'unknown'
    latencyMs: number | null
    detail: string
  }
  redis: {
    status: 'up' | 'down' | 'unknown'
    latencyMs: number | null
    rateLimitBlocks24h: number | null
    detail: string
  }
  checkedAt: string
}

async function checkRailway(): Promise<InfraStatus['railway']> {
  const healthUrl = process.env.RAILWAY_HEARTBEAT_HEALTH_URL
  if (healthUrl) {
    const start = Date.now()
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'User-Agent': 'relay-admin-dashboard/1.0' },
        signal: AbortSignal.timeout(5000),
      })
      const latencyMs = Date.now() - start
      return {
        status: res.ok ? 'up' : 'down',
        latencyMs,
        detail: `HTTP ${res.status} from ${healthUrl}`,
      }
    } catch (e: any) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        detail: `Fetch failed: ${e?.message ?? 'unknown error'}`,
      }
    }
  }

  const apiToken = process.env.RAILWAY_API_TOKEN
  const serviceId = process.env.RAILWAY_SERVICE_ID
  if (apiToken && serviceId) {
    const start = Date.now()
    try {
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'relay-admin-dashboard/1.0',
        },
        body: JSON.stringify({
          query: `query($id: String!) { service(id: $id) { id name } }`,
          variables: { id: serviceId },
        }),
        signal: AbortSignal.timeout(5000),
      })
      const latencyMs = Date.now() - start
      const json = await res.json().catch(() => null) as any
      const ok = res.ok && json?.data?.service?.id === serviceId
      return {
        status: ok ? 'up' : 'down',
        latencyMs,
        detail: ok ? `Service ${json.data.service.name} reachable` : `Railway API HTTP ${res.status}`,
      }
    } catch (e: any) {
      return { status: 'down', latencyMs: Date.now() - start, detail: `Railway API failed: ${e?.message}` }
    }
  }

  return {
    status: 'unknown',
    latencyMs: null,
    detail: 'Set RAILWAY_HEARTBEAT_HEALTH_URL or (RAILWAY_API_TOKEN + RAILWAY_SERVICE_ID)',
  }
}

async function checkRedis(): Promise<InfraStatus['redis']> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    return { status: 'unknown', latencyMs: null, rateLimitBlocks24h: null, detail: 'Upstash env vars missing' }
  }

  const redis = new Redis({ url, token })
  const start = Date.now()
  try {
    const pong = await redis.ping()
    const latencyMs = Date.now() - start
    if (pong !== 'PONG') {
      return { status: 'down', latencyMs, rateLimitBlocks24h: null, detail: `Unexpected ping response: ${pong}` }
    }

    // Best-effort blocks counter — increment-by-rate-limit pattern.
    // If the key doesn't exist, returns null (we report null, not 0).
    let blocks: number | null = null
    try {
      const raw = await redis.get<number | string>('admin:ratelimit:blocks:24h')
      if (raw !== null && raw !== undefined) blocks = Number(raw)
    } catch { /* ignore */ }

    return { status: 'up', latencyMs, rateLimitBlocks24h: blocks, detail: 'Redis reachable' }
  } catch (e: any) {
    return { status: 'down', latencyMs: Date.now() - start, rateLimitBlocks24h: null, detail: `Ping failed: ${e?.message}` }
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const [railway, redis] = await Promise.all([checkRailway(), checkRedis()])

  const status: InfraStatus = {
    railway,
    redis,
    checkedAt: new Date().toISOString(),
  }

  return NextResponse.json({ success: true, status }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
