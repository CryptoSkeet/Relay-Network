/**
 * QuickNode / Solana RPC client for Relay
 *
 * QuickNode Solana endpoints are standard JSON-RPC — just point
 * @solana/web3.js Connection at your endpoint URL. No extra SDK needed.
 *
 * Set in .env.local:
 *   NEXT_PUBLIC_SOLANA_RPC=https://{name}.solana-mainnet.quiknode.pro/{token}/
 *   NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
 */

import { Connection, clusterApiUrl } from '@solana/web3.js'

// Prefer QUICKNODE_RPC_URL (server-side only), fall back to NEXT_PUBLIC_SOLANA_RPC,
// then public devnet. Skip placeholder URLs like "https://your-rpc-url".
// Strips whitespace + literal \r / \n that Vercel dashboard sometimes appends.
function sanitizeUrl(u: string | undefined): string {
  return (u ?? '').replace(/\\r|\\n|\r|\n/g, '').trim()
}

function resolveRpcUrl(): string {
  const qn = sanitizeUrl(process.env.QUICKNODE_RPC_URL)
  const pub = sanitizeUrl(process.env.NEXT_PUBLIC_SOLANA_RPC)
  if (qn && !qn.includes('your-rpc-url')) return qn
  if (pub && !pub.includes('your-rpc-url')) return pub
  return clusterApiUrl('devnet')
}

const rpcUrl = resolveRpcUrl()
// Public devnet fallback — used automatically when the primary RPC returns
// 429 / quota / "limit reached". Lower throughput, no SLA, but unblocks
// production when the QuickNode daily request budget runs out.
const fallbackUrl = sanitizeUrl(process.env.SOLANA_FALLBACK_RPC) || clusterApiUrl('devnet')
const fallbackEnabled = rpcUrl !== fallbackUrl

export const network =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta' | 'devnet' | 'testnet') ||
  'devnet'

// ──────────────────────────────────────────────────────────────────────────
// fetch wrapper: on 429 / quota error from the primary RPC, transparently
// re-issue the same request body to the fallback RPC. Logs the swap so we
// can see in Vercel logs which calls are being shed off the primary plan.
// We only swap the URL, not the request payload — JSON-RPC is identical
// across providers.
// ──────────────────────────────────────────────────────────────────────────

type FetchLike = typeof fetch

function isQuotaError(status: number, bodyText: string): boolean {
  if (status === 429) return true
  if (status === 403 && /quota|limit|daily/i.test(bodyText)) return true
  // QuickNode sometimes returns 200 with a JSON-RPC -32003 error body.
  if (status === 200 && /-32003|daily request limit|upgrade your account/i.test(bodyText)) return true
  return false
}

// Once we detect quota exhaustion on the primary, skip it for this many
// milliseconds so we don't pay the latency cost of primary→429→fallback on
// every single RPC call (a single lockEscrowOnChain may trigger 5+ RPCs;
// 5×~500ms wasted on doomed primary calls = Cloudflare 504).
const PRIMARY_COOLDOWN_MS = 60_000
let primaryDownUntil = 0
let lastFallbackAt = 0

function logFallback(reason: string): void {
  const now = Date.now()
  // Throttle the log line to once per 5s so we don't spam Vercel.
  if (now - lastFallbackAt < 5000) return
  lastFallbackAt = now
  console.warn(`[solana-rpc] primary RPC quota hit (${reason}) — falling back to ${fallbackUrl} for ${PRIMARY_COOLDOWN_MS / 1000}s`)
}

const fallbackFetch: FetchLike = async (input, init) => {
  if (!fallbackEnabled) return fetch(input, init)

  // Hot path: primary is known-down → go straight to fallback.
  if (Date.now() < primaryDownUntil) {
    return fetch(fallbackUrl, init)
  }

  const primaryRes = await fetch(input, init)

  // Fast-path success: most JSON-RPC calls return 200. We still need to
  // catch QuickNode's 200+JSON-RPC-error quota response, but we cap the
  // body inspection size so we don't buffer huge getProgramAccounts
  // responses just to check for "-32003".
  let bodyText = ''
  if (primaryRes.status >= 400) {
    bodyText = await primaryRes.clone().text().catch(() => '')
  } else if (primaryRes.status === 200) {
    // QN quota error bodies are tiny (~250B). Peek at the first 1KB only.
    const peek = primaryRes.clone()
    const reader = peek.body?.getReader()
    if (reader) {
      const { value } = await reader.read().catch(() => ({ value: undefined as Uint8Array | undefined }))
      reader.cancel().catch(() => {})
      if (value) bodyText = new TextDecoder().decode(value.slice(0, 1024))
    }
  }

  if (!isQuotaError(primaryRes.status, bodyText)) return primaryRes

  primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS
  logFallback(`status=${primaryRes.status}`)
  return fetch(fallbackUrl, init)
}

// Singleton Connection — reused across requests
let _connection: Connection | null = null

export function getSolanaConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: rpcUrl.replace('https://', 'wss://'),
      fetch: fallbackFetch,
      // Disable web3.js's built-in retry-on-429 — it sleeps with exponential
      // backoff (500ms → 1s → 2s → ...) inside Connection, which masked our
      // fallback and ate the Vercel function budget. Our fallbackFetch already
      // routes around quota errors transparently.
      disableRetryOnRateLimit: true,
    })
  }
  return _connection
}

/** One-liner for quick checks: await solana().getBalance(pubkey) */
export const solana = getSolanaConnection
