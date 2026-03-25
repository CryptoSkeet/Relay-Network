import { z } from 'zod'

// Type declaration for Node.js process
declare const process: {
  env: Record<string, string | undefined>
}

// Environment variable validation schema
const envSchema = z.object({
  // Database
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // URLs
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // AI Providers
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Solana
  NEXT_PUBLIC_SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta']),
  RELAY_PAYER_SECRET_KEY: z.string().min(1),
  SOLANA_WALLET_ENCRYPTION_KEY: z.string().min(1),
  NEXT_PUBLIC_SOLANA_AUTHORITY_PUBKEY: z.string().min(1),

  // Security
  CRON_SECRET: z.string().min(32),
  AGENT_ENCRYPTION_KEY: z.string().min(32),
  CORS_ALLOWED_ORIGINS: z.string().min(1),

  // Caching
  KV_REST_API_URL: z.string().url(),
  KV_REST_API_TOKEN: z.string().min(1),

  // Storage
  BLOB_READ_WRITE_TOKEN: z.string().min(1),

  // Feature Flags
  NEXT_PUBLIC_ENABLE_STORIES: z.string().transform((val: string) => val === 'true'),
  NEXT_PUBLIC_ENABLE_MESSAGES: z.string().transform((val: string) => val === 'true'),
  NEXT_PUBLIC_ENABLE_MARKETPLACE: z.string().transform((val: string) => val === 'true'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0),

  // PoI Configuration
  POI_VALIDATOR_TEMPO: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0),
  POI_BATCH_SIZE: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0),
  POI_MODEL_WEIGHT: z.string().transform((val: string) => Number(val)).refine((val: number) => val >= 0 && val <= 1),

  // Optional: Stripe
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
})

export type EnvVars = z.infer<typeof envSchema>

/**
 * Validates all environment variables at startup
 * Throws an error if any required variables are missing or invalid
 */
export function validateEnvironment(): EnvVars {
  try {
    const env = envSchema.parse(process.env)
    console.log('✅ Environment variables validated successfully')
    return env
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError
      const missingVars = zodError.errors
        .filter((err: z.ZodIssue) => err.code === 'invalid_type' && err.received === 'undefined')
        .map((err: z.ZodIssue) => err.path.join('.'))

      const invalidVars = zodError.errors
        .filter((err: z.ZodIssue) => err.code !== 'invalid_type' || err.received !== 'undefined')
        .map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`)

      console.error('❌ Environment validation failed:')
      if (missingVars.length > 0) {
        console.error('Missing required variables:', missingVars.join(', '))
      }
      if (invalidVars.length > 0) {
        console.error('Invalid variables:', invalidVars.join('; '))
      }
    }
    throw new Error('Environment validation failed. Check logs for details.')
  }
}

/**
 * Get validated environment variables (memoized)
 */
let cachedEnv: EnvVars | null = null
export function getValidatedEnv(): EnvVars {
  if (!cachedEnv) {
    cachedEnv = validateEnvironment()
  }
  return cachedEnv
}