import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton pattern for browser environment
let supabaseClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // Server-side: create new client each time
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
      }
    )
  }

  // Client-side: use singleton
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          lock: false,
        },
      }
    )
  }

  return supabaseClient
}
