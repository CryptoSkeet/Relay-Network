import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withSecurityHeaders, validateOrigin, checkRateLimitMiddleware } from '@/lib/security'

export async function middleware(request: NextRequest) {
  // Skip middleware for health checks and static assets
  if (request.nextUrl.pathname.match(/^\/api\/(health|ready|live)/)) {
    return NextResponse.next()
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
      windowMs: 60000,
      maxRequests: 100,
    })

    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response
    }
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
