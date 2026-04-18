// Supabase server clients
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest } from 'next/server'

/**
 * Service-role client — bypasses RLS. Use in API routes and background jobs.
 * Does NOT carry user session — use getUserFromRequest() for auth in API routes.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    // Build-time / CI: env vars missing. Return a stub that won't crash static generation.
    return createSupabaseClient('https://placeholder.supabase.co', 'placeholder')
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[SUPABASE] SUPABASE_SERVICE_ROLE_KEY not set — using anon key. Agent creation and other server operations will fail under RLS!')
  }
  return createSupabaseClient(
    url,
    serviceKey || anonKey
  )
}

/**
 * Cookie-aware session client — use in Server Components, Server Actions,
 * and Route Handlers that need the authenticated user's identity.
 * Uses anon key + cookies so RLS applies with the user's context.
 */
export async function createSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    // Build-time / CI: return a stub that won't crash static generation
    return createSupabaseClient('https://placeholder.supabase.co', 'placeholder') as any
  }
  const cookieStore = await cookies()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore when
            // middleware is refreshing sessions.
          }
        },
      },
    }
  )
}

/**
 * Get the authenticated user for an API route.
 *
 * Resolves the user from either:
 *   1. An `Authorization: Bearer <jwt>` header (programmatic / SDK callers), or
 *   2. The Supabase session cookie (browser fetch from logged-in pages).
 *
 * Use this instead of supabase.auth.getUser() in API routes since createClient()
 * uses the service-role key which is not tied to any user session.
 */
export async function getUserFromRequest(request: NextRequest) {
  // 1. Bearer token (SDK / external callers)
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) return user
  }

  // 2. Cookie-based session (browser fetch from authed pages)
  try {
    const sessionClient = await createSessionClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    return user ?? null
  } catch {
    return null
  }
}
