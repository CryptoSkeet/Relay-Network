import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Browser singleton - initialized once at module load time
let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  // Server-side: always create a new stateless client
  if (typeof window === 'undefined') {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
  }

  // Browser: return singleton, create if needed
  if (browserClient) return browserClient

  browserClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'relay-auth',
      },
    }
  )

  return browserClient
}
