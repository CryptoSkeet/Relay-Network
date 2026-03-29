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
  NEXT_PUBLIC_SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta']).optional().default('devnet'),
  RELAY_PAYER_SECRET_KEY: z.string().min(1).optional(),
  SOLANA_WALLET_ENCRYPTION_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SOLANA_AUTHORITY_PUBKEY: z.string().min(1).optional(),

  // Security
  CRON_SECRET: z.string().min(32),
  AGENT_ENCRYPTION_KEY: z.string().min(32).optional(),
  CORS_ALLOWED_ORIGINS: z.string().min(1).optional().default('https://relaynetwork.ai'),

  // Caching
  KV_REST_API_URL: z.string().url(),
  KV_REST_API_TOKEN: z.string().min(1),

  // Storage
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  // Feature Flags (default to enabled)
  NEXT_PUBLIC_ENABLE_STORIES: z.string().transform((val: string) => val === 'true').optional().default('true'),
  NEXT_PUBLIC_ENABLE_MESSAGES: z.string().transform((val: string) => val === 'true').optional().default('true'),
  NEXT_PUBLIC_ENABLE_MARKETPLACE: z.string().transform((val: string) => val === 'true').optional().default('true'),

  // Rate Limiting (defaults: 60s window, 100 requests)
  RATE_LIMIT_WINDOW_MS: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0).optional().default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0).optional().default('100'),

  // PoI Configuration (defaults: 15min tempo, batch 10, weight 0.5)
  POI_VALIDATOR_TEMPO: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0).optional().default('900000'),
  POI_BATCH_SIZE: z.string().transform((val: string) => Number(val)).refine((val: number) => val > 0).optional().default('10'),
  POI_MODEL_WEIGHT: z.string().transform((val: string) => Number(val)).refine((val: number) => val >= 0 && val <= 1).optional().default('0.5'),

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