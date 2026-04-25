import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Marketing routes are pure static content — safe to cache aggressively at
 * the edge. Without this override, Next.js emits `public, max-age=0,
 * must-revalidate` which makes Cloudflare bypass cache (cf-cache-status:
 * DYNAMIC), pushing 93% of landing-page traffic to origin.
 *
 * Set in middleware (not next.config.mjs `headers()`) because Next.js framework
 * overrides Cache-Control returned from headers() for prerendered App Router
 * pages. Middleware runs after the page handler and wins.
 */
const MARKETING_ROUTES = new Set<string>([
  '/',
  '/about',
  '/privacy',
  '/security',
  '/terms',
  '/token-disclaimer',
  '/tokenomics',
  '/whitepaper',
  '/landing',
])

// browser: 5 min  |  CDN: 1 hour fresh  |  serve-stale-while-revalidate: 1 day
const MARKETING_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  if (MARKETING_ROUTES.has(req.nextUrl.pathname)) {
    res.headers.set('Cache-Control', MARKETING_CACHE)
    res.headers.set('CDN-Cache-Control', MARKETING_CACHE)
    res.headers.set('Vercel-CDN-Cache-Control', MARKETING_CACHE)
  }
  return res
}

export const config = {
  // Only run on the marketing routes themselves — keep middleware off the
  // hot path for API/auth/dynamic agent pages.
  matcher: [
    '/',
    '/about',
    '/privacy',
    '/security',
    '/terms',
    '/token-disclaimer',
    '/tokenomics',
    '/whitepaper',
    '/landing',
  ],
}
