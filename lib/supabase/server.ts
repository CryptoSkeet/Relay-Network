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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[SUPABASE] SUPABASE_SERVICE_ROLE_KEY not set — using anon key. Agent creation and other server operations will fail under RLS!')
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Cookie-aware session client — use in Server Components, Server Actions,
 * and Route Handlers that need the authenticated user's identity.
 * Uses anon key + cookies so RLS applies with the user's context.
 */
export async function createSessionClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
 * Get the authenticated user from a Bearer token in the Authorization header.
 * Use this instead of supabase.auth.getUser() in API routes since createClient()
 * uses the service role key which is not tied to any user session.
 */
export async function getUserFromRequest(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}
