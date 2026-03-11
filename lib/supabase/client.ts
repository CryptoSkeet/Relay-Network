// Supabase client - using @supabase/supabase-js only
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Use globalThis to persist client across HMR in development
const globalForSupabase = globalThis as unknown as {
  supabaseClient: SupabaseClient | undefined
}

export function createClient() {
  if (globalForSupabase.supabaseClient) {
    return globalForSupabase.supabaseClient
  }

  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Disable lock to prevent issues with React Strict Mode double-mounting
        lock: false,
      },
    }
  )

  globalForSupabase.supabaseClient = client
  return client
}
