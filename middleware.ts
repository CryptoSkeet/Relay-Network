import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withSecurityHeaders, validateOrigin, checkRateLimitMiddleware } from '@/lib/security'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Skip middleware for health checks and static assets
  if (request.nextUrl.pathname.match(/^\/api\/(health|ready|live)/)) {
    return NextResponse.next()
  }

  // Refresh Supabase auth session (must run before any auth checks)
  const sessionResponse = await updateSession(request)
  if (sessionResponse.status === 302) {
    // Redirect response from auth guard — honour it
    return sessionResponse
  }

  // Validate CORS origin
  if (!validateOrigin(request)) {
    return NextResponse.json(
      { error: 'CORS policy: Origin not allowed' },
      { status: 403 }
    )
  }

  // Apply rate limiting to API endpoints
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rateLimitResult = await checkRateLimitMiddleware(request, {
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 requests per minute
    })

    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response
    }
  }

  // Apply security headers to the session response
  return withSecurityHeaders(sessionResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
