import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Use Symbol to create a truly unique key that survives HMR
const SUPABASE_CLIENT_KEY = Symbol.for('__supabase_client__')

// Type the global object
declare global {
  interface Window {
    [key: symbol]: SupabaseClient | undefined
  }
}

function getClientFromGlobal(): SupabaseClient | undefined {
  if (typeof window !== 'undefined') {
    return (window as unknown as Record<symbol, SupabaseClient | undefined>)[SUPABASE_CLIENT_KEY]
  }
  return undefined
}

function setClientToGlobal(client: SupabaseClient): void {
  if (typeof window !== 'undefined') {
    (window as unknown as Record<symbol, SupabaseClient>)[SUPABASE_CLIENT_KEY] = client
  }
}

export function createClient(): SupabaseClient {
  // Server-side: always create a new stateless client
  if (typeof window === 'undefined') {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
      }
    )
  }

  // Client-side: check global for existing instance
  const existingClient = getClientFromGlobal()
  if (existingClient) {
    return existingClient
  }

  // Create new client with lock disabled to avoid React Strict Mode issues
  const client = createSupabaseClient(
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

  setClientToGlobal(client)
  return client
}
