/**
 * Client-safe Solscan URL helpers.
 *
 * Uses NEXT_PUBLIC_SOLANA_NETWORK (defaults to 'devnet') to append the
 * correct `?cluster=` suffix. Mainnet renders no suffix.
 *
 * Safe to import from client components — no web3.js / Node dependencies.
 */

type Cluster = 'devnet' | 'testnet' | 'mainnet-beta'

function resolveCluster(): Cluster {
  const raw = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet').trim().toLowerCase()
  if (raw === 'mainnet' || raw === 'mainnet-beta') return 'mainnet-beta'
  if (raw === 'testnet') return 'testnet'
  return 'devnet'
}

function suffix(): string {
  const c = resolveCluster()
  return c === 'mainnet-beta' ? '' : `?cluster=${c}`
}

export function solscanAccount(address: string, hash?: string): string {
  return `https://solscan.io/account/${address}${suffix()}${hash ? hash : ''}`
}

export function solscanTx(signature: string): string {
  return `https://solscan.io/tx/${signature}${suffix()}`
}

export function solscanToken(mint: string): string {
  return `https://solscan.io/token/${mint}${suffix()}`
}
