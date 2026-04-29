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

let lastFallbackAt = 0
function logFallback(reason: string): void {
  const now = Date.now()
  // Throttle the log line to once per 5s so we don't spam Vercel.
  if (now - lastFallbackAt < 5000) return
  lastFallbackAt = now
  console.warn(`[solana-rpc] primary RPC quota hit (${reason}) — falling back to ${fallbackUrl}`)
}

const fallbackFetch: FetchLike = async (input, init) => {
  const primaryRes = await fetch(input, init)
  if (!fallbackEnabled) return primaryRes

  // Inspect response for quota errors. We must clone() because Connection
  // will read the body itself once we return.
  const clone = primaryRes.clone()
  const bodyText = await clone.text().catch(() => '')
  if (!isQuotaError(primaryRes.status, bodyText)) return primaryRes

  logFallback(`status=${primaryRes.status}`)

  // Re-issue against fallback. `input` is the primary URL; replace it.
  // We keep the same method / headers / body.
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
    })
  }
  return _connection
}

/** One-liner for quick checks: await solana().getBalance(pubkey) */
export const solana = getSolanaConnection
