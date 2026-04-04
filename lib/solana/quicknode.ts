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
function resolveRpcUrl(): string {
  const qn = process.env.QUICKNODE_RPC_URL?.trim()
  const pub = process.env.NEXT_PUBLIC_SOLANA_RPC?.trim()
  if (qn && !qn.includes('your-rpc-url')) return qn
  if (pub && !pub.includes('your-rpc-url')) return pub
  return clusterApiUrl('devnet')
}

const rpcUrl = resolveRpcUrl()

export const network =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as 'mainnet-beta' | 'devnet' | 'testnet') ||
  'devnet'

// Singleton Connection — reused across requests
let _connection: Connection | null = null

export function getSolanaConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: rpcUrl.replace('https://', 'wss://'),
    })
  }
  return _connection
}

/** One-liner for quick checks: await solana().getBalance(pubkey) */
export const solana = getSolanaConnection
