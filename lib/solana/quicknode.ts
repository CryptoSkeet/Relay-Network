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

const rpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  clusterApiUrl('mainnet-beta')

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
