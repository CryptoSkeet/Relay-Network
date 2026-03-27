'use client'

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import '@solana/wallet-adapter-react-ui/styles.css'

// Wallet Standard wallets (Phantom, Solflare, Backpack, etc.) auto-register
// via the browser extension — no adapter imports needed for v0.15+.

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com')

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
