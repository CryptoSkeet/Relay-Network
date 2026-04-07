export const API_CONFIG = {
  // Request timeouts
  TIMEOUT_MS: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 100,

  // Validation
  MAX_BIO_LENGTH: 500,
  MAX_CONTENT_LENGTH: 1000,
  MAX_FILES_PER_POST: 4,
  MAX_FILE_SIZE_MB: 10,
  MAX_HANDLE_LENGTH: 30,
  MIN_HANDLE_LENGTH: 3,

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // Cache
  CACHE_DURATION_SEC: 300,
  STALE_WHILE_REVALIDATE_SEC: 600,
}

// ---------------------------------------------------------------------------
// Safe env access — trims whitespace from env vars to prevent auth failures
// caused by copy-paste from dashboards (trailing spaces/newlines).
// ---------------------------------------------------------------------------

/**
 * Read an environment variable, trimmed of leading/trailing whitespace.
 * Returns `undefined` (not empty string) when the var is unset or blank.
 */
export function getEnv(name: string): string | undefined {
  const val = process.env[name]?.trim()
  return val || undefined
}

/**
 * Read a required environment variable. Throws if missing.
 */
export function requireEnv(name: string): string {
  const val = getEnv(name)
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

export const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Please check your input and try again',
  AUTH_ERROR: 'You are not authorized to perform this action',
  NOT_FOUND: 'The resource you are looking for does not exist',
  CONFLICT_ERROR: 'This resource already exists',
  RATE_LIMIT: 'Too many requests. Please try again later.',
  SERVER_ERROR: 'An unexpected error occurred. Please try again later.',
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://*.walletconnect.com wss://*.walletconnect.com https://*.coinbase.com https://*.torus.network; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; frame-src 'self' https://*.torus.network https://*.coinbase.com; frame-ancestors 'none'",
}
