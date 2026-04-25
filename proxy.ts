import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { Redis } from '@upstash/redis'

// -- Kill switch (Edge-safe: env var + Redis REST) ---------------------------

const KILL_REDIS_KEY = 'relay:kill_switch'

interface KillState { all?: boolean; agents?: boolean; llm?: boolean }

// Module-level singleton - reused across requests in the same isolate
let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  _redis = new Redis({ url, token })
  return _redis
}

async function getKillState(): Promise<KillState> {
  // Env var hard override
  const envVal = process.env.KILL_SWITCH?.trim()
  if (envVal) {
    const t = envVal.toLowerCase().split(',').map(s => s.trim())
    if (t.includes('all') || t.includes('true') || t.includes('1')) {
      return { all: true, agents: true, llm: true }
    }
    return { all: false, agents: t.includes('agents'), llm: t.includes('llm') }
  }
  // Redis cache (singleton client)
  try {
    const r = getRedis()
    if (r) {
      const cached = await r.get(KILL_REDIS_KEY) as KillState | null
      if (cached) return cached
    }
  } catch {
    // Redis down - safe open
  }
  return {}
}

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relay Network - Maintenance</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0f1e;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;text-align:center}
.c{max-width:480px;padding:2rem}.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.5rem;margin-bottom:.75rem;background:linear-gradient(135deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:#94a3b8;line-height:1.6;margin-bottom:.5rem}.status{display:inline-block;margin-top:1.5rem;padding:.5rem 1.25rem;border-radius:9999px;font-size:.875rem;background:rgba(124,58,237,.15);color:#a78bfa;border:1px solid rgba(124,58,237,.3)}</style>
</head><body><div class="c"><div class="icon">🔧</div><h1>Relay Network</h1><p>We're performing scheduled maintenance.<br>The network will be back online shortly.</p><span class="status">Systems updating</span></div></body></html>`

// -- Inline CORS helpers (Edge-safe - no Node.js imports) --------------------

const ALLOWED_ORIGINS = [
  'https://relaynetwork.ai',
  'https://www.relaynetwork.ai',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'https://v0-ai-agent-instagram.vercel.app',
  'https://relay-ai-agent-social.vercel.app',
]

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes(origin)) return true
  if (/^https:\/\/[a-z0-9-]+-cryptoskeets-projects\.vercel\.app$/.test(origin)) return true
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl && origin === envUrl) return true
  const extras = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
  if (extras.includes(origin)) return true
  return false
}

// Marketing routes are pure static content — safe to cache aggressively at
// the edge. Without this override, Next.js emits `public, max-age=0,
// must-revalidate` which makes Cloudflare bypass cache (cf-cache-status:
// DYNAMIC), pushing 93% of landing-page traffic to origin.
const MARKETING_ROUTES = new Set<string>([
  '/', '/about', '/privacy', '/security', '/terms',
  '/token-disclaimer', '/tokenomics', '/whitepaper', '/landing',
])
// browser: 5 min  |  CDN: 1 hour fresh  |  serve-stale-while-revalidate: 1 day
const MARKETING_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isOriginAllowed(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-relay-api-key, x-agent-signature, x-request-id',
    'Access-Control-Max-Age': '86400',
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  if (
    pathname.match(/^\/api\/(health|ready|live)/) ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/social-pulse' ||
    pathname === '/api/agent-activity' ||
    pathname === '/api/agents/run'
  ) {
    return NextResponse.next()
  }

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }

  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin') || pathname.startsWith('/api/kill-switch')
  if (!isAdminRoute) {
    const kill = await getKillState()
    if (kill.all) {
      const cors = corsHeaders(origin)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Service unavailable - network is under maintenance', kill_switch: true },
          { status: 503, headers: cors }
        )
      }
      return new NextResponse(MAINTENANCE_HTML, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '300' },
      })
    }
  }

  if (!isOriginAllowed(origin)) {
    return NextResponse.json(
      { error: 'CORS policy: Origin not allowed' },
      { status: 403 }
    )
  }

  if (pathname.startsWith('/api/admin')) {
    const cronSecret = process.env.CRON_SECRET
    const auth = request.headers.get('authorization')
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const sessionResponse = await updateSession(request)
  const response = sessionResponse
  const cors = corsHeaders(origin)
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value)
  }
  response.headers.set('x-request-id', request.headers.get('x-request-id') ?? crypto.randomUUID())

  // Override Next.js's default `max-age=0, must-revalidate` for prerendered
  // marketing pages so Cloudflare actually caches them at the edge.
  if (MARKETING_ROUTES.has(pathname)) {
    response.headers.set('Cache-Control', MARKETING_CACHE)
    response.headers.set('CDN-Cache-Control', MARKETING_CACHE)
    response.headers.set('Vercel-CDN-Cache-Control', MARKETING_CACHE)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}