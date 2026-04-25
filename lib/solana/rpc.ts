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

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set`)
  return v.replace(/\\r|\\n|\r|\n/g, '')
}

let _rpc: Rpc<SolanaRpcApi> | undefined
let _rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi> | undefined

export function getRpc(): Rpc<SolanaRpcApi> {
  if (!_rpc) _rpc = createSolanaRpc(requireEnv('SOLANA_RPC_URL'))
  return _rpc
}

export function getRpcSubscriptions(): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  if (!_rpcSubscriptions) {
    _rpcSubscriptions = createSolanaRpcSubscriptions(requireEnv('SOLANA_RPC_WSS_URL'))
  }
  return _rpcSubscriptions
}
