import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Top-level Next.js middleware.
 *
 * Runs on every request and refreshes the Supabase auth tokens so server-side
 * code (API routes, Server Components) sees a fresh session. Without this, the
 * sb-* cookies issued at sign-in expire after ~1h and every subsequent
 * cookie-based auth check returns null → 401 Unauthorized.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
