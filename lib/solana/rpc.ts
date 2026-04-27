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

function resolveWssRpcUrl(): string {
  const explicit = clean(process.env.SOLANA_RPC_WSS_URL)
  if (explicit) return explicit
  // Derive from the HTTP RPC URL — providers expose the same host on wss://.
  const http = resolveHttpRpcUrl()
  return http.replace(/^http(s?):\/\//i, (_, s) => `ws${s}://`)
}

let _rpc: Rpc<SolanaRpcApi> | undefined
let _rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi> | undefined

export function getRpc(): Rpc<SolanaRpcApi> {
  if (!_rpc) _rpc = createSolanaRpc(resolveHttpRpcUrl())
  return _rpc
}

export function getRpcSubscriptions(): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  if (!_rpcSubscriptions) {
    _rpcSubscriptions = createSolanaRpcSubscriptions(resolveWssRpcUrl())
  }
  return _rpcSubscriptions
}
