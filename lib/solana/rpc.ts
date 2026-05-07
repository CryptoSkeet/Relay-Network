/**
 * Solana RPC singletons (@solana/kit).
 *
 * Import these everywhere. Do NOT call `createSolanaRpc` elsewhere — keeping
 * one instance ensures connection reuse and a single place to swap providers.
 *
 * Safe in both Node (API routes, workers) and browser (read-only RPC calls
 * from client components). Writes go through `send.ts`, which is server-only.
 *
 * Env:
 *   SOLANA_RPC_URL       HTTPS JSON-RPC endpoint (e.g. QuickNode / Helius).
 *   SOLANA_RPC_WSS_URL   WebSocket subscriptions endpoint.
 *
 * Throws are deferred to first access so module import (including Next.js
 * build steps) never crashes when a route happens to pull this in without
 * the env set.
 */

import {
  createSolanaRpc,
  createSolanaRpcFromTransport,
  createDefaultRpcTransport,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from '@solana/kit'

function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/\\r|\\n|\r|\n/g, '')
  return t || undefined
}

function resolveHttpRpcUrl(): string {
  const url =
    clean(process.env.SOLANA_RPC_URL) ||
    clean(process.env.QUICKNODE_RPC_URL) ||
    clean(process.env.HELIUS_RPC_URL) ||
    clean(process.env.NEXT_PUBLIC_SOLANA_RPC)
  if (!url) {
    throw new Error('SOLANA_RPC_URL is not set (also tried QUICKNODE_RPC_URL, HELIUS_RPC_URL, NEXT_PUBLIC_SOLANA_RPC)')
  }
  return url
}

function resolveFallbackHttpRpcUrl(primary: string): string | undefined {
  // Explicit operator-set fallback wins.
  const explicit = clean(process.env.SOLANA_RPC_URL_FALLBACK)
  if (explicit && explicit !== primary) return explicit
  // Auto-derive cluster from primary URL so we don't accidentally pin
  // mainnet at a devnet endpoint or vice-versa.
  const lower = primary.toLowerCase()
  if (lower.includes('devnet')) return 'https://api.devnet.solana.com'
  if (lower.includes('testnet')) return 'https://api.testnet.solana.com'
  if (lower.includes('mainnet')) return 'https://api.mainnet-beta.solana.com'
  return undefined
}

function resolveWssRpcUrl(): string {
  const explicit = clean(process.env.SOLANA_RPC_WSS_URL)
  if (explicit) return explicit
  const http = resolveHttpRpcUrl()
  // If the primary HTTP host is unhealthy, primary WSS is almost always
  // unhealthy too (same host/cert). Subscriptions are persistent connections
  // that we can't trivially failover per-call, so we prefer the fallback
  // host's WSS whenever a fallback is defined. This trades a small amount
  // of confirmation latency on the happy path for resilience when the
  // primary RPC provider goes down (which has happened in prod).
  // Operators who want strict primary-WSS routing can set
  // SOLANA_RPC_WSS_URL explicitly to override.
  const fallbackHttp = resolveFallbackHttpRpcUrl(http)
  const wssSource = fallbackHttp ?? http
  return wssSource.replace(/^http(s?):\/\//i, (_, s) => `ws${s}://`)
}

// Transient / network-layer failures we should retry on a fallback transport.
// Anything that comes back as a structured JSON-RPC error (-32xxx) is a
// real protocol response and must NOT be retried — that masks bugs.
function isTransientTransportError(err: unknown): boolean {
  if (!err) return false
  const e = err as any
  // Node 20 fetch wraps DNS / TCP / TLS / HTTP-2 framing failures as
  // `TypeError: fetch failed` with a `cause` carrying the real code.
  const msg = (e?.message || '').toString().toLowerCase()
  if (msg.includes('fetch failed') || msg.includes('terminated') || msg.includes('socket hang up')) return true
  const causeCode = (e?.cause?.code || '').toString()
  const causeMsg = (e?.cause?.message || '').toString().toLowerCase()
  const transientCodes = [
    'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN',
    'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR',
    'ERR_TLS_CERT_ALTNAME_INVALID',
  ]
  if (transientCodes.includes(causeCode)) return true
  if (causeMsg.includes('tlsv1') || causeMsg.includes('ssl')) return true
  // HTTP layer: 5xx from upstream. Kit throws `SolanaHttpError` with `statusCode`.
  if (typeof e?.statusCode === 'number' && e.statusCode >= 500) return true
  return false
}

/**
 * Build a transport that prefers `primary` but transparently falls back to
 * `fallback` when primary returns a transport-layer failure. Once primary has
 * failed, it is short-circuited for `SHORT_CIRCUIT_MS` so every RPC call
 * doesn't pay primary→fail→fallback latency. Per-call timeouts still apply.
 */
function buildResilientTransport(primaryUrl: string, fallbackUrl: string | undefined) {
  const primary = createDefaultRpcTransport({ url: primaryUrl })
  if (!fallbackUrl) return primary
  const fallback = createDefaultRpcTransport({ url: fallbackUrl })

  const SHORT_CIRCUIT_MS = 60_000
  let primaryDownUntil = 0

  const transport = (async (...args: any[]) => {
    const now = Date.now()
    const tryFallback = async (reason: unknown) => {
      // Latch primary as down so subsequent calls in this window skip it.
      primaryDownUntil = Date.now() + SHORT_CIRCUIT_MS
      try {
        // eslint-disable-next-line no-console
        console.warn(
          `[solana-rpc] primary failed (${(reason as any)?.message || reason}); ` +
          `using fallback ${fallbackUrl} for ${SHORT_CIRCUIT_MS / 1000}s`
        )
      } catch { /* ignore */ }
      return await (fallback as any)(...args)
    }

    if (now < primaryDownUntil) {
      // Primary is in the cooldown window — go straight to fallback, but
      // don't crash if fallback also blips; surface its error.
      return await (fallback as any)(...args)
    }

    try {
      return await (primary as any)(...args)
    } catch (err) {
      if (isTransientTransportError(err)) {
        return await tryFallback(err)
      }
      throw err
    }
  }) as typeof primary

  return transport
}

let _rpc: Rpc<SolanaRpcApi> | undefined
let _rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi> | undefined

export function getRpc(): Rpc<SolanaRpcApi> {
  if (!_rpc) {
    const primaryUrl = resolveHttpRpcUrl()
    const fallbackUrl = resolveFallbackHttpRpcUrl(primaryUrl)
    if (fallbackUrl) {
      _rpc = createSolanaRpcFromTransport(buildResilientTransport(primaryUrl, fallbackUrl))
    } else {
      _rpc = createSolanaRpc(primaryUrl)
    }
  }
  return _rpc
}

export function getRpcSubscriptions(): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  if (!_rpcSubscriptions) {
    _rpcSubscriptions = createSolanaRpcSubscriptions(resolveWssRpcUrl())
  }
  return _rpcSubscriptions
}
