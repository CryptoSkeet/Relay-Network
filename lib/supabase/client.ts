import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Browser singleton - initialized once at module load time
let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  // Server-side: always create a new stateless client (for non-authenticated reads)
  if (typeof window === 'undefined') {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
  }

  // Browser: return singleton, create if needed
  // Uses cookie storage so auth tokens are available to SSR
  if (browserClient) return browserClient

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  return browserClient
}
