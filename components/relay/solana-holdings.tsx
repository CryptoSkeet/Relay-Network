'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Coins, Loader2, RefreshCw, ExternalLink, Zap, Copy, Check } from 'lucide-react'

interface OnChainBalance {
  wallet: {
    public_key: string
    network: string
    explorer_url: string
  }
  balances: {
    sol: number
    relay: number
    relay_mint: string | null
  }
}

interface SolanaHoldingsProps {
  agentId: string
  walletAddress?: string
}

export function SolanaHoldings({ agentId, walletAddress }: SolanaHoldingsProps) {
  const [data, setData] = useState<OnChainBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [airdropping, setAirdropping] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastAirdropSig, setLastAirdropSig] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = walletAddress
        ? `wallet_address=${walletAddress}`
        : `agent_id=${agentId}`
      const res = await fetch(`/api/v1/wallet/on-chain?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch')
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agentId, walletAddress])

  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 30_000)
    return () => clearInterval(interval)
  }, [fetchBalance])

  const requestAirdrop = async () => {
    setAirdropping(true)
    try {
      const res = await fetch('/api/v1/wallet/airdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, sol_amount: 1, relay_amount: 1000 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setLastAirdropSig(json.transactions?.sol_airdrop_sig ?? null)
      await fetchBalance()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAirdropping(false)
    }
  }

  const copyAddress = () => {
    if (!data?.wallet.public_key) return
    navigator.clipboard.writeText(data.wallet.public_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchBalance}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const { wallet, balances } = data
  const isDevnet = wallet.network !== 'mainnet-beta'
  const fmt = (n: number, d = 4) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: d })

  return (
    <div className="space-y-4">
      {/* Network badge */}
      <div className="flex items-center justify-between">
        <Badge variant={isDevnet ? 'secondary' : 'default'} className="gap-1">
          <span className={`w-2 h-2 rounded-full ${isDevnet ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          {wallet.network}
        </Badge>
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={fetchBalance}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Wallet address */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Solana Wallet Address</p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono truncate flex-1 text-foreground/80">
              {wallet.public_key}
            </code>
            <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0" onClick={copyAddress}>
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </Button>
            <a href={wallet.explorer_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0">
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* SOL balance */}
      <Card className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 border-purple-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">◎</span>
            </div>
            SOL Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{fmt(balances.sol)} <span className="text-base font-normal text-muted-foreground">SOL</span></p>
          <p className="text-xs text-muted-foreground mt-1">Used for transaction fees</p>
        </CardContent>
      </Card>

      {/* RELAY balance */}
      <Card className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
              <Coins className="w-4 h-4 text-white" />
            </div>
            RELAY Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl font-bold">{fmt(balances.relay, 2)} <span className="text-base font-normal text-muted-foreground">RELAY</span></p>
          {balances.relay_mint && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground truncate">
                Mint: <code className="font-mono">{balances.relay_mint.slice(0, 12)}...{balances.relay_mint.slice(-6)}</code>
              </p>
              <a
                href={`https://solscan.io/token/${balances.relay_mint}${isDevnet ? `?cluster=${wallet.network}` : ''}`}
                target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline text-xs shrink-0"
              >
                View on Solscan ↗
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devnet airdrop */}
      {isDevnet && (
        <Card className="glass-card border-amber-500/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-medium">Devnet Faucet</p>
              <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs ml-auto">devnet only</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Request 1 SOL + 1,000 RELAY airdrop to your devnet wallet for testing.
            </p>
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={requestAirdrop}
              disabled={airdropping}
            >
              {airdropping
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Requesting airdrop...</>
                : <><Zap className="w-4 h-4 text-amber-500" /> Get 1 SOL + 1,000 RELAY</>
              }
            </Button>
            {lastAirdropSig && (
              <a
                href={`https://solscan.io/tx/${lastAirdropSig}?cluster=${wallet.network}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> View airdrop on Solscan
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
