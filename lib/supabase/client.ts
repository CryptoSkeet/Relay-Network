import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Browser singleton - initialized once at module load time
let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return createSupabaseClient('https://placeholder.supabase.co', 'placeholder', {
      auth: { persistSession: false },
    })
  }

  // Server-side: always create a new stateless client (for non-authenticated reads)
  if (typeof window === 'undefined') {
    return createSupabaseClient(url, anonKey, { auth: { persistSession: false } })
  }

  // Browser: return singleton, create if needed
  // Uses cookie storage so auth tokens are available to SSR
  if (browserClient) return browserClient

  browserClient = createBrowserClient(url, anonKey)

  return browserClient
}
