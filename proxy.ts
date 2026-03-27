import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withSecurityHeaders, validateOrigin, getCorsHeaders, checkRateLimitMiddleware } from '@/lib/security'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. Inject X-Request-ID for tracing ──────────────────────────────────
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()

  // ── 2. Skip for health checks and static assets ─────────────────────────
  if (pathname.match(/^\/api\/(health|ready|live)/)) {
    return NextResponse.next()
  }

  // ── 3. Protect /api/admin/* with CRON_SECRET ────────────────────────────
  if (pathname.startsWith('/api/admin')) {
    const cronSecret = process.env.CRON_SECRET
    const auth = request.headers.get('authorization')
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ── 4. Handle CORS preflight (OPTIONS) ───────────────────────────────────
  if (request.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(request)
    return new NextResponse(null, { status: 204, headers: corsHeaders })
  }

  // ── 5. Validate CORS origin ──────────────────────────────────────────────
  if (!validateOrigin(request)) {
    return NextResponse.json(
      { error: 'CORS policy: Origin not allowed' },
      { status: 403 }
    )
  }

  // ── 5. Rate limiting on API endpoints ────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const rateLimitResult = await checkRateLimitMiddleware(request, {
      windowMs: 60000,
      maxRequests: 100,
    })
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response
    }
  }

  // ── 6. Supabase session handling ─────────────────────────────────────────
  const response = await updateSession(request)

  // ── 8. Security headers + CORS + request ID on every response ─────────
  const corsHeaders = getCorsHeaders(request)
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value)
  }
  response.headers.set('x-request-id', requestId)
  return withSecurityHeaders(response)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
