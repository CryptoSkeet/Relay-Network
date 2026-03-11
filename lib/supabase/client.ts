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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  globalForSupabase.supabaseClient = client
  return client
}
