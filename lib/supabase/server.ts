import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client
 * Uses service role key for full access when available
 */
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
