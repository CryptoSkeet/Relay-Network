'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'

interface X402BalanceProps {
  agentId?: string
  walletAddress?: string
  /** When true, fetches the user's linked wallets and shows a picker. */
  showLinkedWalletPicker?: boolean
}

interface BalanceResp {
  success: boolean
  wallet?: { public_key: string; network: string }
  usdc?: { balance: number; ready_to_spend: boolean; explorer_url: string }
  error?: string
}

interface LinkedWallet {
  id: string
  address: string
  label: string | null
  network: string
  is_primary: boolean
}

function shortAddr(a: string): string {
  if (!a) return '—'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

export function X402Balance({ agentId, walletAddress, showLinkedWalletPicker }: X402BalanceProps) {
  const [data, setData] = useState<BalanceResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string | null>(walletAddress ?? null)

  useEffect(() => {
    if (!showLinkedWalletPicker) return
    let cancelled = false
    fetch('/api/v1/wallet/link', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        const wallets: LinkedWallet[] = j?.wallets ?? []
        setLinkedWallets(wallets)
        if (!walletAddress) {
          const primary = wallets.find(w => w.is_primary) ?? wallets[0]
          if (primary) setSelectedAddress(primary.address)
        }
      })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [showLinkedWalletPicker, walletAddress])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const addr = walletAddress ?? selectedAddress
      let qs: string
      if (addr) qs = `wallet_address=${encodeURIComponent(addr)}`
      else if (agentId) qs = `agent_id=${agentId}`
      else { setLoading(false); return }

      const res = await fetch(`/api/v1/wallet/x402-balance?${qs}`, { cache: 'no-store' })
      const json: BalanceResp = await res.json()
      setData(json)
    } catch (err: any) {
      setData({ success: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }, [agentId, walletAddress, selectedAddress])

  useEffect(() => { load() }, [load])

  const balance = data?.usdc?.balance ?? 0
  const ready = !!data?.usdc?.ready_to_spend
  const network = data?.wallet?.network ?? 'solana:mainnet'
  const isMainnet = network === 'solana:mainnet'
  const sourceLabel = walletAddress
    ? 'External wallet'
    : selectedAddress
      ? (linkedWallets.find(w => w.address === selectedAddress)?.label || 'Linked wallet')
      : 'Agent custodial wallet'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            x402 USDC Balance
            <Badge variant={isMainnet ? 'default' : 'secondary'} className="text-[10px] uppercase">
              {isMainnet ? 'Mainnet' : 'Devnet'}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Available to spend on x402 paywalls (agentic.market, etc) · {sourceLabel}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showLinkedWalletPicker && linkedWallets.length > 0 && !walletAddress && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Source wallet</label>
            <select
              className="w-full text-xs font-mono bg-background border rounded px-2 py-1.5"
              value={selectedAddress ?? ''}
              onChange={e => setSelectedAddress(e.target.value || null)}
            >
              {agentId && <option value="">Agent custodial wallet</option>}
              {linkedWallets.map(w => (
                <option key={w.id} value={w.address}>
                  {w.is_primary ? '★ ' : ''}{w.label ? `${w.label} — ` : ''}{shortAddr(w.address)}
                </option>
              ))}
            </select>
          </div>
        )}
        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking USDC…
          </div>
        ) : data?.error ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{data.error}</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono">${balance.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">USDC</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {ready ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Ready to spend on x402</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-500">
                    No USDC on {isMainnet ? 'mainnet' : 'devnet'} — fund this wallet to enable outbound x402
                  </span>
                </>
              )}
            </div>
            {data?.usdc?.explorer_url && (
              <Button variant="outline" size="sm" asChild className="w-full">
                <a href={data.usdc.explorer_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  View on Solscan
                </a>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
