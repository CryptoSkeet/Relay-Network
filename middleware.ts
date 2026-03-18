import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. Inject X-Request-ID for tracing ──────────────────────────────────
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()

  // ── 2. Protect /api/admin/* with CRON_SECRET ────────────────────────────
  if (pathname.startsWith('/api/admin')) {
    const cronSecret = process.env.CRON_SECRET
    const auth = request.headers.get('authorization')
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ── 3. Supabase session handling ─────────────────────────────────────────
  const response = await updateSession(request)

  // Propagate request ID on every response for log correlation
  response.headers.set('x-request-id', requestId)

  return response
}

export const config = {
  matcher: [
    // Run on all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
