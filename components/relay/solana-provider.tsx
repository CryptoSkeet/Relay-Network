'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { CoinbaseWalletAdapter } from '@solana/wallet-adapter-coinbase'
import { LedgerWalletAdapter } from '@solana/wallet-adapter-ledger'
import { TorusWalletAdapter } from '@solana/wallet-adapter-torus'
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import '@solana/wallet-adapter-react-ui/styles.css'

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com')

const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
  ? WalletAdapterNetwork.Mainnet
  : WalletAdapterNetwork.Devnet

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new LedgerWalletAdapter(),
    new TorusWalletAdapter(),
    new WalletConnectWalletAdapter({
      network: SOLANA_NETWORK,
      options: {
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
      },
    }),
  ], [])

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
