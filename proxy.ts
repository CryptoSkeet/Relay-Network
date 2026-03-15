import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withSecurityHeaders, validateOrigin, checkRateLimitMiddleware } from '@/lib/security'

export async function middleware(request: NextRequest) {
  // Skip middleware for health checks and static assets
  if (request.nextUrl.pathname.match(/^\/api\/(health|ready|live)/)) {
    return NextResponse.next()
  }

  // Add security headers
  let response = NextResponse.next()
  response = withSecurityHeaders(response)

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

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

