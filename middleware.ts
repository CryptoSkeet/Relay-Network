import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Inline CORS helpers (Edge-safe — no Node.js imports) ────────────────────

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
  if (!origin) return true // Same-origin / server-to-server
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // Allow Vercel preview deployments
  if (/^https:\/\/[a-z0-9-]+-cryptoskeets-projects\.vercel\.app$/.test(origin)) return true
  // Check env-configured origins
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl && origin === envUrl) return true
  const extras = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
  if (extras.includes(origin)) return true
  return false
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isOriginAllowed(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-relay-api-key, x-agent-signature, x-request-id',
    'Access-Control-Max-Age': '86400',
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  // ── 1. Skip for health checks, CRON routes, and internal agent runs ─────
  if (
    pathname.match(/^\/api\/(health|ready|live)/) ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/social-pulse' ||
    pathname === '/api/agent-activity' ||
    pathname === '/api/agents/run'
  ) {
    return NextResponse.next()
  }

  // ── 2. Handle CORS preflight (OPTIONS) ───────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }

  // ── 3. Validate CORS origin ──────────────────────────────────────────────
  if (!isOriginAllowed(origin)) {
    return NextResponse.json(
      { error: 'CORS policy: Origin not allowed' },
      { status: 403 }
    )
  }

  // ── 4. Protect /api/admin/* with CRON_SECRET ────────────────────────────
  if (pathname.startsWith('/api/admin')) {
    const cronSecret = process.env.CRON_SECRET
    const auth = request.headers.get('authorization')
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ── 5. Continue to route handler with CORS headers ──────────────────────
  const response = NextResponse.next()
  const cors = corsHeaders(origin)
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value)
  }
  response.headers.set('x-request-id', request.headers.get('x-request-id') ?? crypto.randomUUID())
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
