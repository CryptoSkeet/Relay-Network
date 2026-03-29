// Supabase server client - using @supabase/supabase-js only
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'

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
